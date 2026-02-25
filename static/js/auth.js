// ================== DOM ENTRY POINT ==================

document.addEventListener("DOMContentLoaded", () => {
  initPasswordToggles();
  initSignupValidation();
  initLoginValidation();
  initDateValueStyling();
  initBFCacheReset();
});


// ================== VALIDATION CONSTANTS ==================

const NAME_REGEX = /^[A-Za-z\s\-']+$/;
const EMAIL_REGEX = /^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/;
const SYMBOL_REGEX = /[!@#$%^&*(),.?":{}|<>]/;


// ================== VALIDATION HELPERS ==================

function invalidate(input, message) {
  if (!input) return;

  input.classList.add("is-invalid");

  const feedbackId = input.getAttribute("aria-describedby");
  if (!feedbackId) return;

  const feedback = document.getElementById(feedbackId);
  if (feedback) feedback.textContent = message;
}

function clearInvalid(input) {
  if (!input) return;

  input.classList.remove("is-invalid");

  const feedbackId = input.getAttribute("aria-describedby");
  if (!feedbackId) return;

  const feedback = document.getElementById(feedbackId);
  if (feedback) feedback.textContent = "";
}


// ================== FIELD VALIDATORS ==================

function validateName(input, label) {
  const value = input.value.trim();

  if (!value) return `${label} is required`
  if (value.length < 2) return `${label} must be at least 2 characters long.`;
  if (!NAME_REGEX.test(value)) return `${label} contains invalid characters.`;

  return null;
}

function validateEmail(input) {
  const value = input.value.trim();

  if (!value) return "Email is required.";
  if (!EMAIL_REGEX.test(value)) return "Please enter a valid email address.";

  return null;
}

function validatePassword(input) {
  const value = input.value;

  if (!value) return "Password is required.";
  if (value.length < 8) return "Password must be at least 8 characters long.";
  if (!/[A-Z]/.test(value)) return "Password must include an uppercase letter.";
  if (!/[a-z]/.test(value)) return "Password must include a lowercase letter.";
  if (!/[0-9]/.test(value)) return "Password must include a number.";
  if (!SYMBOL_REGEX.test(value)) return "Password must include a symbol.";

  return null;
}

function validateDOB(input) {
  if (!input.value) return "Date of birth is required.";

  try {
    const [year, month, day] = input.value.split("-").map(Number);
    const birthDate = new Date(year, month - 1, day);
    const today = new Date();

    let age = today.getFullYear() - birthDate.getFullYear();
    const m = today.getMonth() - birthDate.getMonth();
    const d = today.getDate() - birthDate.getDate();

    if (m < 0 || (m === 0 && d < 0)) age--;

    if (age < 13) return "You must be 13 or older to create an account.";

  } catch {
    return "Please enter a valid date.";
  }

  return null;
}


// ================== PASSWORD VISIBILITY TOGGLE ==================

function initPasswordToggles() {
  document.querySelectorAll("form").forEach(form => {
    const input = form.querySelector("[data-password]");
    const toggle = form.querySelector("[data-toggle-password]");

    if (!input || !toggle) return;

    const icon = toggle.querySelector("i");

    toggle.addEventListener("click", () => {
      const visible = input.type === "text";
      input.type = visible ? "password" : "text";

      if (icon) {
        icon.classList.toggle("bi-eye", visible);
        icon.classList.toggle("bi-eye-slash", !visible);
      }

      input.focus();
    });
  });
}


// ================== SIGNUP FORM ==================

function initSignupValidation() {
  const form = document.getElementById("signupForm");
  if (!form) return;

  form.addEventListener("submit", (e) => {
    let valid = true;

    const first = form.querySelector("input[name='first_name']");
    const last = form.querySelector("input[name='last_name']");
    const email = form.querySelector("input[name='email']");
    const dob = form.querySelector("input[name='dob']");
    const password = form.querySelector("input[name='password']");

    [first, last, email, dob, password].forEach(clearInvalid);

    let error;

    error = validateName(first, "First name");
    if (error) { invalidate(first, error); valid = false; }

    error = validateName(last, "Last name");
    if (error) { invalidate(last, error); valid = false; }

    error = validateEmail(email);
    if (error) { invalidate(email, error); valid = false; }

    error = validateDOB(dob);
    if (error) { invalidate(dob, error); valid = false; }

    error = validatePassword(password);
    if (error) { invalidate(password, error); valid = false; }

    if (!valid) e.preventDefault();
  });
}


// ================== LOGIN FORM ==================

function initLoginValidation() {
  const form = document.getElementById("loginForm");
  if (!form) return;

  form.addEventListener("submit", (e) => {
    let valid = true;

    const email = form.querySelector("input[name='email']");
    const password = form.querySelector("input[name='password']");

    [email, password].forEach(clearInvalid);

    let error = validateEmail(email);
    if (error) { invalidate(email, error); valid = false; }

    if (!password.value.trim()) {
      invalidate(password, "Password is required.");
      valid = false;
    }

    if (!valid) e.preventDefault();
  });
}


// ================== DATE INPUT STYLING ==================

function initDateValueStyling() {
  const PLACEHOLDER_COLOR = "#b5bec3";
  const TEXT_COLOR = "#1e1e1e";

  document.querySelectorAll("input[type='date']").forEach(input => {
    const update = () => {
      input.style.color = input.value ? TEXT_COLOR : PLACEHOLDER_COLOR;
    };

    update();

    ["input", "change", "blur", "focus"].forEach(evt => {
      input.addEventListener(evt, update);
    });

    window.addEventListener("pageshow", update);
  });
}


// ================== BFCACHE RESET ==================

function initBFCacheReset() {
  window.addEventListener("pageshow", (event) => {
    const navType = performance.getEntriesByType("navigation")[0]?.type;
    if (!event.persisted && navType !== "back_forward") return;

    ["signupForm", "loginForm"].forEach(id => {
      const form = document.getElementById(id);
      if (!form) return;

      form.reset();

      form.querySelectorAll(".is-invalid").forEach(el =>
        el.classList.remove("is-invalid")
      );

      form.querySelectorAll(".invalid-feedback").forEach(fb =>
        fb.textContent = ""
      );

      const pwd = form.querySelector("[data-password]");
      if (pwd) pwd.type = "password";

      const date = form.querySelector("input[type='date']");
      if (date) date.style.color = "#b5bec3";
    });
  });
}
