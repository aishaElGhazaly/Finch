import { showToast } from "./toast.js";

// ================= DOM ENTRY POINT =================

document.addEventListener("DOMContentLoaded", () => {
    initAccountModal();
    initAccountActions();
});


// ================= VALIDATION (mirror signup) =================

const NAME_REGEX = /^[A-Za-z\s\-']+$/;
const EMAIL_REGEX = /^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/;
const SYMBOL_REGEX = /[!@#$%^&*(),.?":{}|<>]/;

function validateName(value) {
    if (!value) return "Required";
    if (value.length < 2) return "Min 2 characters";
    if (!NAME_REGEX.test(value)) return "Invalid characters";
    return null;
}

function validateEmail(value) {
    if (!value) return "Required";
    if (!EMAIL_REGEX.test(value)) return "Invalid email";
    return null;
}

function validatePassword(value) {
    if (!value) return "Required";
    if (value.length < 8) return "Min 8 characters";
    if (!/[A-Z]/.test(value)) return "Uppercase required";
    if (!/[a-z]/.test(value)) return "Lowercase required";
    if (!/[0-9]/.test(value)) return "Number required";
    if (!SYMBOL_REGEX.test(value)) return "Symbol required";
    return null;
}


// ================= CONFIG =================

const csrfToken =
    document.querySelector('meta[name="csrf-token"]')?.content;


// ================= DOM REFERENCES =================

let modalEl, modal;
let formEl, titleEl, fieldsEl, errorEl, submitBtn;
let textTemplate, passwordTemplate;
let activeModalConfig = null;


// ================= INITIALIZERS =================

function initAccountModal() {
    modalEl = document.getElementById("accountModal");
    modal = new bootstrap.Modal(modalEl);

    formEl = document.getElementById("accountModalForm");
    titleEl = document.getElementById("accountModalTitle");
    fieldsEl = document.getElementById("accountModalFields");
    errorEl = document.getElementById("accountModalError");
    submitBtn = document.getElementById("accountModalSubmit");

    textTemplate = document.getElementById("field-text");
    passwordTemplate = document.getElementById("field-password");

    formEl.addEventListener("submit", handleSubmit);
}

function initAccountActions() {
    document.addEventListener("click", handleActionClick);
}


// ================= HELPERS =================

function clearModal() {
    fieldsEl.innerHTML = "";
    errorEl.textContent = "";
    errorEl.classList.add("d-none");
    submitBtn.disabled = true;
}

function showError(msg) {
    errorEl.textContent = msg;
    errorEl.classList.remove("d-none");
}

function buildInput({
    name,
    label,
    type = "text",
    autofocus = false
}) {
    const template = type === "password" ? passwordTemplate : textTemplate;
    const node = template.content.cloneNode(true);

    const input = node.querySelector("input");
    const labelEl = node.querySelector("label");

    const feedback = document.createElement("div");
    feedback.className = "invalid-feedback";
    feedback.setAttribute("aria-live", "assertive");

    labelEl.textContent = label;
    input.name = name;
    input.type = type;

    input.after(feedback);

    input.addEventListener("input", () => {
        input.classList.remove("is-invalid");
        input.setAttribute("aria-invalid", "false");
        feedback.textContent = "";
    });

    if (autofocus) {
        setTimeout(() => input.focus(), 0);
    }

    // Password visibility toggle
    const toggle = node.querySelector(".password-toggle");
    if (toggle) {
        const icon = toggle.querySelector("i");
        toggle.addEventListener("click", () => {
            const visible = input.type === "text";
            input.type = visible ? "password" : "text";
            icon.classList.toggle("bi-eye", visible);
            icon.classList.toggle("bi-eye-slash", !visible);
            input.focus();
        });
    }

    return {
        node,
        input,
        feedback
    };
}

async function postJSON(url, payload) {
    const res = await fetch(url, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            "X-CSRFToken": csrfToken
        },
        body: JSON.stringify(payload)
    });

    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw data;
    return data;
}


// ================= MODAL DEFINITIONS =================

const MODALS = {

    "edit-name": {
        title: "Change Name",
        endpoint: "/api/account/name",
        submitText: "Save",
        successMessage: "Name updated successfully",
        build() {
            const row = document.createElement("div");
            row.className = "row g-2";

            const first = buildInput({
                name: "first_name",
                label: "First Name",
                autofocus: true
            });
            const last = buildInput({
                name: "last_name",
                label: "Last Name"
            });
            const password = buildInput({
                name: "password",
                label: "Password",
                type: "password"
            });

            [first, last].forEach(f => {
                const col = document.createElement("div");
                col.className = "col";
                col.appendChild(f.node);
                row.appendChild(col);
            });

            fieldsEl.append(row, password.node);

            const validate = () => {
                submitBtn.disabled = !!validateName(first.input.value.trim()) ||
                    !!validateName(last.input.value.trim()) ||
                    password.input.value.trim().length < 8;
            };

            [first, last, password].forEach(f => f.input.addEventListener("input", validate));
        },
        optimistic(res) {
            document.querySelector("[data-field='name']").textContent = `${res.first_name} ${res.last_name}`;

            document.querySelectorAll("[data-field='greeting']").forEach(el => {
                el.textContent = `Hello, ${res.first_name}`;
            });
        }
    },

    "edit-email": {
        title: "Update Email",
        endpoint: "/api/account/email",
        successMessage: "Email updated successfully",
        submitText: "Save",
        build() {
            const email = buildInput({
                name: "email",
                label: "New Email",
                autofocus: true
            });
            const password = buildInput({
                name: "password",
                label: "Password",
                type: "password"
            });

            fieldsEl.append(email.node, password.node);

            const validate = () => {
                submitBtn.disabled = !!validateEmail(email.input.value.trim()) ||
                    password.input.value.trim().length < 8;
            };

            [email, password].forEach(f => f.input.addEventListener("input", validate));
        },
        optimistic(res) {
            document.querySelector("[data-field='email']").textContent = res.email;
        }
    },

    "edit-password": {
        title: "Change Password",
        endpoint: "/api/account/password",
        submitText: "Update Password",
        build() {
            const current = buildInput({
                name: "current_password",
                label: "Current Password",
                type: "password",
                autofocus: true
            });
            const next = buildInput({
                name: "new_password",
                label: "New Password",
                type: "password"
            });
            const confirm = buildInput({
                name: "confirm_password",
                label: "Confirm New Password",
                type: "password"
            });

            fieldsEl.append(current.node, next.node, confirm.node);

            const validate = () => {
                submitBtn.disabled =
                    current.input.value.trim().length < 8 ||
                    !!validatePassword(next.input.value.trim()) ||
                    next.input.value !== confirm.input.value;
            };

            [current, next, confirm].forEach(f => f.input.addEventListener("input", validate));
        }
    },

    "delete-account": {
        title: "Delete Account",
        endpoint: "/api/account/delete",
        submitText: "Delete Account",
        danger: true,
        build() {
            const confirm = buildInput({
                name: "confirm",
                label: "Type DELETE to confirm",
                autofocus: true
            });
            const password = buildInput({
                name: "password",
                label: "Password",
                type: "password"
            });

            fieldsEl.append(confirm.node, password.node);

            const validate = () => {
                submitBtn.disabled =
                    confirm.input.value !== "DELETE" ||
                    password.input.value.trim().length < 8;
            };

            [confirm, password].forEach(f => f.input.addEventListener("input", validate));
        }
    }
};


// ================= MODAL CONTROL =================

function openModal(action) {
    activeModalConfig = MODALS[action];
    if (!activeModalConfig) return;

    clearModal();

    titleEl.textContent = activeModalConfig.title;
    submitBtn.textContent = activeModalConfig.submitText;
    submitBtn.className = `btn ${activeModalConfig.danger ? "btn-danger" : "btn-dark"}`;
    formEl.dataset.endpoint = activeModalConfig.endpoint;

    activeModalConfig.build();
    modal.show();
}


// ================= SUBMIT HANDLER =================

async function handleSubmit(e) {
    e.preventDefault();

    const payload = {};
    fieldsEl.querySelectorAll("input").forEach(input => {
        payload[input.name] = input.value.trim();
    });

    try {
        const res = await postJSON(formEl.dataset.endpoint, payload);
        modal.hide();

        if (activeModalConfig.optimistic) {
            activeModalConfig.optimistic(res);
        }

        if (activeModalConfig.successMessage) {
            showToast(activeModalConfig.successMessage);
        }

    } catch (err) {
        if (err.errors) {
            Object.entries(err.errors).forEach(([name, msg]) => {
                const input = fieldsEl.querySelector(`[name="${name}"]`);
                if (!input) return;

                const feedback = input.nextElementSibling;
                input.classList.add("is-invalid");
                input.setAttribute("aria-invalid", "true");
                feedback.textContent = msg;
            });
        } else {
            showError("Request failed.");
        }
    }
}


// ================= EVENT DELEGATION =================

function handleActionClick(e) {
    const action = e.target.closest("[data-action]")?.dataset.action;
    if (!action) return;

    e.preventDefault();
    openModal(action);
}
