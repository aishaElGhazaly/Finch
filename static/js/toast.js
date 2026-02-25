export function showToast(message, type = "success") {
    const container = document.getElementById("toastContainer");
    const el = document.createElement("div");

    el.className = `toast text-bg-${type} border-0`;
    el.innerHTML = `
        <div class="d-flex">
            <div class="toast-body">${message}</div>
            <button class="btn-close btn-close-white me-2 m-auto"
                    data-bs-dismiss="toast"></button>
        </div>
    `;

    container.appendChild(el);
    new bootstrap.Toast(el, {
        delay: 3000
    }).show();
    el.addEventListener("hidden.bs.toast", () => el.remove());
}
