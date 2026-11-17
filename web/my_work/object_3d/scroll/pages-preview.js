(() => {
  const serverActions = new Set(["upload", "shoot", "export", "open-character"]);
  document.addEventListener("click", event => {
    const button = event.target.closest("button");
    if (!button || !serverActions.has(button.id)) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    document.getElementById("now").textContent = "Processing service required";
    document.getElementById("why").textContent =
      "This web preview runs the supplied scroll. See the GitHub project for the full version.";
  }, true);
})();
