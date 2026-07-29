const API_URL = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'
    ? 'http://localhost:3000' 
    : 'https://pd.pharmacies.doctor';

document.addEventListener("DOMContentLoaded", () => {
    let slug = new URLSearchParams(window.location.search).get("slug");

    // Support SEO URLs like /blog/testing-logo
    if (!slug) {
        const parts = window.location.pathname.split("/").filter(Boolean);

        if (parts.length >= 2 && parts[0] === "blog") {
            slug = parts[1];
        }
    }   

    if (!slug) {
        window.location.href = "/blog";
        return;
    }

    fetchBlogPost(slug);
});

async function fetchBlogPost(slug) {
    try {
        const response = await fetch(`${API_URL}/api/blogs/${slug}`);
        if (!response.ok) {
            if (response.status === 404) {
                showError("Article not found.");
            } else {
                throw new Error("Server error");
            }
            return;
        }

        const blog = await response.json();

        // Update Document Title Info
        document.title = `${blog.title} - RxHouse`;
        
        // Update view fields
        document.getElementById("post-title").innerText = blog.title;
        document.getElementById("post-category").innerText = blog.category || 'General';
        document.getElementById("post-author").innerText = `By ${blog.author || 'RxHouse'}`;
        
        const dateObj = new Date(blog.created_at);
        document.getElementById("post-date").innerText = dateObj.toLocaleDateString(undefined, {
            year: 'numeric',
            month: 'long',
            day: 'numeric'
        });

        // VPS Path Prefixing configuration
        if (blog.featured_image) {
            const imgContainer = document.getElementById("post-image-container");
            const img = document.getElementById("post-featured-image");
            
            // Checks if it is already an absolute path, otherwise prefixes the backend API origin
            img.src = blog.featured_image.startsWith('http') 
                ? blog.featured_image 
                : `${API_URL}/${blog.featured_image}`;
                
            img.alt = blog.title;
            imgContainer.style.display = 'block';
        }

        // Render HTML article body safe injection
        document.getElementById("post-content").innerHTML = blog.content;

    } catch (err) {
        console.error(err);
        showError("Unable to retrieve article. Please try again later.");
    }
}

function showError(message) {
    document.getElementById("post-title").innerText = "Oops!";
    document.getElementById("post-content").innerHTML = `<p class="error-msg">${message}</p>`;
}