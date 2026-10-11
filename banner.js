// Bouton « Prompt » du bandeau commun (SPECIFICATION.md, § 11.6) : copie PROMPT.md, à coller au début
// d’une conversation avec un assistant IA. Le bouton dit lui-même s’il a réussi, le temps de le lire :
// le bandeau n’a pas de zone de message sur toutes les pages.
document.querySelectorAll(".banner-prompt").forEach(button => {
  const label = button.textContent;
  let timer = 0;
  button.addEventListener("click", async () => {
    clearTimeout(timer);
    try {
      const response = await fetch(new URL(button.dataset.prompt, location.href), { cache: "no-cache" });
      if (!response.ok) throw new Error(`PROMPT.md introuvable (${response.status})`);
      await navigator.clipboard.writeText(await response.text());
      button.textContent = "Prompt copié ✓";
    } catch (error) {
      button.textContent = "Copie impossible";
      button.title = error.message;
    }
    timer = setTimeout(() => { button.textContent = label; }, 2000);
  });
});
