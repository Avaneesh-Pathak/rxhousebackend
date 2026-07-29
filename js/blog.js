const API_URL = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'
    ? 'http://localhost:3000' 
    : 'https://pd.pharmacies.doctor';

document.addEventListener("DOMContentLoaded", () => {
    fetchBlogs();
});

async function fetchBlogs() {
    const grid = document.getElementById("blog-posts-grid");
    if (!grid) return;

    try {
        const response = await fetch(`${API_URL}/api/blogs`);
        if (!response.ok) {
            throw new Error("Failed to fetch blogs");
        }
        const blogs = await response.json();

        if (blogs.length === 0) {
            grid.innerHTML = '<p class="no-posts">No articles published yet. Check back soon!</p>';
            return;
        }

        grid.innerHTML = blogs.map(blog => {
            const date = new Date(blog.created_at).toLocaleDateString('en-US', {
                year: 'numeric',
                month: 'long',
                day: 'numeric'
            });

            // IMAGE RESOLUTION FIX: Prefix relative path with API_URL if it is not an absolute link
            let imageUrl = "images/healthcare.jpg"; // Default fallback
            if (blog.featured_image) {
                imageUrl = blog.featured_image.startsWith('http') 
                    ? blog.featured_image 
                    : `${API_URL}/${blog.featured_image}`;
            }
            const articleUrl =
                window.location.hostname === "localhost" ||
                window.location.hostname === "127.0.0.1"
                    ? `http://localhost:3000/blog/${blog.slug}`
                    : `https://pd.pharmacies.doctor/blog/${blog.slug}`;
                return `
                <article class="blog-card" onclick="window.location.href='${articleUrl}'">
                    <div class="card-image">
                        <!-- fallback image on error keeps layout intact -->
                        <img src="${imageUrl}" alt="${blog.title}" onerror="this.src='https://images.unsplash.com/photo-1576091160550-2173dba999ef?auto=format&fit=crop&q=80&w=600'">
                    </div>
                    <div class="card-content">
                        <span class="category">${blog.category || 'Health'}</span>
                        <h2 class="post-title">
                            <a href="${articleUrl}" onclick="event.stopPropagation()">${blog.title}</a>
                        </h2>
                        <p class="post-excerpt">${blog.excerpt || ''}</p>
                        <div class="post-meta">
                            <span class="author"><i class="far fa-user"></i> By ${blog.author || 'RxHouse'}</span>
                            <span class="separator">•</span>
                            <span class="date"><i class="far fa-calendar-alt"></i> ${date}</span>
                        </div>
                        <a href="${articleUrl}" class="read-more"onclick="event.stopPropagation()">Read Full Article →</a>
                    </div>
                </article>
            `;
        }).join('');

    } catch (err) {
        console.error(err);
        grid.innerHTML = '<p class="error-msg">Error loading articles. Please try again later.</p>';
    }
}