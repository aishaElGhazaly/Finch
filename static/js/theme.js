document.addEventListener("DOMContentLoaded", () => {

    const toggle = document.getElementById("themeToggle");

    if (!toggle) return;

    const saved = localStorage.getItem("theme");

    if (saved === "dark") {
        enableDark();
    }

    toggle.addEventListener("click", () => {

        const current = document.documentElement.dataset.theme;

        if (current === "dark") {
            disableDark();
        } else {
            enableDark();
        }
    });
});


function enableDark() {

    document.documentElement.dataset.theme = "dark";
    localStorage.setItem("theme", "dark");

    updateIcon(true);
    updateChartsTheme("dark");
}


function disableDark() {

    document.documentElement.dataset.theme = "light";
    localStorage.setItem("theme", "light");

    updateIcon(false);
    updateChartsTheme("light");
}


function updateIcon(isDark) {

    const icon = document.querySelector("#themeToggle i");

    if (!icon) return;

    icon.className = isDark
        ? "bi bi-sun"
        : "bi bi-moon";
}
