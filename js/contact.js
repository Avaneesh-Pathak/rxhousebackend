async function submitContact(e) {
    e.preventDefault();

    const API_BASE = (window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1")
        ? "http://localhost:3000"
        : "https://pd.pharmacies.doctor";

    const button = e.target.querySelector("button");
    if (button) button.disabled = true;

    const data = {
        first_name: document.getElementById("contact-fname").value,
        last_name: document.getElementById("contact-lname").value,
        email: document.getElementById("contact-email").value,
        phone: document.getElementById("contact-phone").value,
        subject: document.getElementById("contact-subject").value,
        message: document.getElementById("contact-message").value
    };

    try {
        const response = await fetch(`${API_BASE}/api/contact`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify(data)
        });

        const result = await response.json();

        if (result.success) {
            alert(result.message || "Your message has been sent!");
            e.target.reset();
        } else {
            alert(result.error || "Unable to send message.");
        }

    } catch (err) {
        console.error(err);
        alert("Unable to send your message. Please try again.");
    } finally {
        if (button) button.disabled = false;
    }
}
