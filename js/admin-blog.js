const API_URL = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'
    ? 'http://localhost:3000' 
    : 'https://pd.pharmacies.doctor';

// Global array used to prevent syntax crashes with stringified HTML attributes
let allBlogs = [];

document.addEventListener("DOMContentLoaded", () => {
    fetchAdminBlogs();
    document.getElementById("blog-form").addEventListener("submit", handleFormSubmit);
    initDragAndDrop();
});

// Auto-generates a URL slug
function generateSlug(text) {
    const slug = text.toLowerCase()
        .replace(/[^a-z0-9 -]/g, '') 
        .replace(/\s+/g, '-')        
        .replace(/-+/g, '-');        
    document.getElementById("blog-slug").value = slug;
}

// TOAST SYSTEM
function showToast(msg, isError = false) {
    const toast = document.getElementById('toast');
    const toastMsg = document.getElementById('toast-msg');
    if (!toast || !toastMsg) return;
    
    toastMsg.textContent = msg;
    toast.style.borderLeftColor = isError ? '#dc3545' : 'var(--teal)';
    const icon = toast.querySelector('i');
    if (icon) icon.style.color = isError ? '#dc3545' : 'var(--teal)';
    
    toast.classList.add('show');
    clearTimeout(toast._timer);
    toast._timer = setTimeout(() => {
        toast.classList.remove('show');
    }, 3000);
}

// FETCH DATA
async function fetchAdminBlogs() {
    const tbody = document.getElementById("admin-blog-list");
    if (!tbody) return;
    tbody.innerHTML = '<tr><td colspan="6">Loading...</td></tr>';

    try {
        const response = await fetch(`${API_URL}/api/admin/blogs`);
        allBlogs = await response.json();

        if (allBlogs.length === 0) {
            tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;">No posts found. Click "+ Add New Post" to write one.</td></tr>';
            return;
        }

        tbody.innerHTML = allBlogs.map(blog => `
            <tr>
                <td>${blog.id}</td>
                <td><strong>${blog.title}</strong><br><small>/blog-post.html?slug=${blog.slug}</small></td>
                <td>${blog.category || 'N/A'}</td>
                <td>${blog.is_published ? '<span class="status-badge published">Published</span>' : '<span class="status-badge draft">Draft</span>'}</td>
                <td>${new Date(blog.created_at).toLocaleDateString()}</td>
                <td>
                    <button class="btn btn-primary" onclick="populateEditForm(${blog.id})">Edit</button>
                    <button class="btn btn-danger" onclick="deleteBlog(${blog.id})">Delete</button>
                </td>
            </tr>
        `).join('');
    } catch (err) {
        console.error(err);
        tbody.innerHTML = '<tr><td colspan="6" style="color:red;text-align:center;">Failed to load blogs. Make sure your server is running.</td></tr>';
    }
}

function showCreateForm() {
    document.getElementById("form-heading").innerText = "Create New Blog Post";
    document.getElementById("blog-id").value = "";
    document.getElementById("blog-form").reset();
    resetDropZone();
    document.getElementById("blog-form-container").style.display = "block";
    document.getElementById('btn-toggle-form').textContent = '× Cancel';
    document.getElementById('btn-toggle-form').onclick = hideForm;
    window.scrollTo({ top: 0, behavior: 'smooth' });
}

function hideForm() {
    document.getElementById("blog-form-container").style.display = "none";
    document.getElementById('btn-toggle-form').textContent = '+ Add New Post';
    document.getElementById('btn-toggle-form').onclick = showCreateForm;
    resetDropZone();
}

function populateEditForm(id) {
    const blog = allBlogs.find(b => b.id === id);
    if (!blog) return;

    showCreateForm();
    document.getElementById("form-heading").innerText = `Edit Blog Post (ID: ${blog.id})`;
    document.getElementById("blog-id").value = blog.id;
    document.getElementById("blog-title").value = blog.title;
    document.getElementById("blog-slug").value = blog.slug;
    document.getElementById("blog-category").value = blog.category || "";
    document.getElementById("blog-excerpt").value = blog.excerpt || "";
    document.getElementById("blog-content").value = blog.content;
    document.getElementById("blog-status").value = blog.is_published.toString();

    if (blog.featured_image) {
        document.getElementById("blog-image").value = blog.featured_image;
        showPreview(`${API_URL}/${blog.featured_image}`, blog.featured_image.split('/').pop());
    } else {
        resetDropZone();
    }
}

// DRAG AND DROP HANDLERS
function initDragAndDrop() {
    const dropZone = document.getElementById("drop-zone");
    const fileInput = document.getElementById("file-input");

    if (!dropZone || !fileInput) return;

    dropZone.addEventListener("click", () => fileInput.click());

    dropZone.addEventListener("dragover", (e) => {
        e.preventDefault();
        dropZone.classList.add("dragover");
    });

    ["dragleave", "dragend"].forEach(type => {
        dropZone.addEventListener(type, () => dropZone.classList.remove("dragover"));
    });

    dropZone.addEventListener("drop", (e) => {
        e.preventDefault();
        dropZone.classList.remove("dragover");
        if (e.dataTransfer.files.length > 0) {
            handleImageUpload(e.dataTransfer.files[0]);
        }
    });
}

function handleFileSelect(event) {
    if (event.target.files.length > 0) {
        handleImageUpload(event.target.files[0]);
    }
}

async function handleImageUpload(file) {
    const blogImageField = document.getElementById("blog-image");
    if (!blogImageField) return;

    if (!file.type.startsWith("image/")) {
        showToast("Please select a valid image file.", true);
        return;
    }

    // UPDATE: Increased file size validation limit to 10MB
    if (file.size > 10 * 1024 * 1024) {
        showToast("Image size must be less than 10MB", true);
        return;
    }

    const reader = new FileReader();
    reader.readAsDataURL(file);
    
    reader.onloadstart = () => {
        showToast("Processing image file...");
    };

    reader.onloadend = async () => {
        const base64String = reader.result;

        try {
            showToast("Uploading to VPS...");
            const response = await fetch(`${API_URL}/api/upload-base64`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ image: base64String })
            });

            if (!response.ok) throw new Error("VPS upload failed");

            const result = await response.json();
            if (result.success) {
                blogImageField.value = result.imageUrl;
                showPreview(`${API_URL}/${result.imageUrl}`, file.name);
                showToast("Image uploaded successfully!");
            } else {
                showToast("Upload failed: " + result.error, true);
                resetDropZone();
            }
        } catch (err) {
            console.error(err);
            showToast("Failed to upload image to server.", true);
            resetDropZone();
        }
    };
}

function showPreview(url, name) {
    const previewContainer = document.getElementById('preview-container');
    const previewImage = document.getElementById('preview-image');
    const fileName = document.getElementById('file-name');
    const dropZone = document.getElementById('drop-zone');

    if (!previewContainer || !previewImage || !fileName || !dropZone) return;

    previewImage.src = url;
    fileName.textContent = name || 'image.webp';
    previewContainer.style.display = 'block';
    
    const icon = dropZone.querySelector('.dz-icon');
    const p1 = dropZone.querySelector('p:first-of-type');
    const hint = dropZone.querySelector('.dz-hint');
    const sizeBadge = dropZone.querySelector('.dz-size-badge') || dropZone.querySelector('.dz-badge');
    
    if (icon) icon.style.display = 'none';
    if (p1) p1.style.display = 'none';
    if (hint) hint.style.display = 'none';
    if (sizeBadge) sizeBadge.style.display = 'none'; // Hide visual badge
}

function resetDropZone() {
    const previewContainer = document.getElementById('preview-container');
    const previewImage = document.getElementById('preview-image');
    const fileName = document.getElementById('file-name');
    const dropZone = document.getElementById('drop-zone');
    const fileInput = document.getElementById('file-input');

    if (previewContainer) previewContainer.style.display = 'none';
    if (previewImage) previewImage.src = '';
    if (fileName) fileName.textContent = '';
    if (fileInput) fileInput.value = '';
    
    const blogImgInput = document.getElementById("blog-image");
    if (blogImgInput) blogImgInput.value = "";

    if (dropZone) {
        const icon = dropZone.querySelector('.dz-icon');
        const p1 = dropZone.querySelector('p:first-of-type');
        const hint = dropZone.querySelector('.dz-hint');
        const sizeBadge = dropZone.querySelector('.dz-size-badge') || dropZone.querySelector('.dz-badge');
        
        if (icon) icon.style.display = 'block';
        if (p1) p1.style.display = 'block';
        if (hint) hint.style.display = 'block';
        if (sizeBadge) sizeBadge.style.display = 'inline-block'; // Restore visual badge
        
        dropZone.classList.remove('dragover');
    }
}

function removeFile(event) {
    if (event) event.stopPropagation();
    resetDropZone();
    showToast('Image removed');
}

// FORM SUBMISSION (Correct model schemas matching backend attributes)
async function handleFormSubmit(e) {
    e.preventDefault();

    const id = document.getElementById("blog-id").value;
    const blogData = {
        title: document.getElementById("blog-title").value.trim(),
        slug: document.getElementById("blog-slug").value.trim(),
        category: document.getElementById("blog-category").value.trim(),
        excerpt: document.getElementById("blog-excerpt").value.trim(),
        content: document.getElementById("blog-content").value.trim(),
        featured_image: document.getElementById("blog-image").value.trim(), 
        is_published: document.getElementById("blog-status").value === "true"
    };

    if (!blogData.title || !blogData.slug || !blogData.content) {
        showToast('Required fields are missing.', true);
        return;
    }

    try {
        let response;
        if (id) {
            response = await fetch(`${API_URL}/api/blogs/${id}`, {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(blogData)
            });
        } else {
            response = await fetch(`${API_URL}/api/blogs`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(blogData)
            });
        }

        const result = await response.json();
        if (response.ok) {
            showToast(id ? 'Post updated successfully!' : 'Post created successfully!');
            hideForm();
            fetchAdminBlogs();
        } else {
            showToast("Error: " + (result.error || "Save failed"), true);
        }
    } catch (err) {
        console.error(err);
        showToast("An error occurred during submission.", true);
    }
}

async function deleteBlog(id) {
    if (!confirm("Are you sure you want to delete this blog post?")) {
        return;
    }

    try {
        const response = await fetch(`${API_URL}/api/blogs/${id}`, {
            method: "DELETE"
        });

        const result = await response.json();
        if (response.ok) {
            showToast(result.message || 'Post deleted successfully!');
            fetchAdminBlogs();
        } else {
            showToast("Error: " + result.error, true);
        }
    } catch (err) {
        console.error(err);
        showToast("An error occurred deleting the post.", true);
    }
}

// Window scope exports
window.showCreateForm = showCreateForm;
window.hideForm = hideForm;
window.generateSlug = generateSlug;
window.populateEditForm = populateEditForm;
window.deleteBlog = deleteBlog;
window.handleFileSelect = handleFileSelect;
window.removeFile = removeFile;