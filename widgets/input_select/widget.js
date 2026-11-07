// Liste déroulante d’un texte à trous (SPECIFICATION.md, § 2.9) : un <select> natif, dont la valeur est
// l’indice du choix dans la liste de l’auteur. Il se lit, s’écrit, se fige et se colore comme un champ
// texte ; sa largeur suit le texte choisi (fitSelects), à chaque saisie et après « Solution ».
{
  const { verdicts, sendToPython, typedAnswer } = PyWimsWidgets.choiceBehaviour({ multiple: false });
  PyWimsWidgets.define("input_select", {
    verdicts, sendToPython, typedAnswer,
    render: ({ name, attributes }, { draw, idPrefix }) => PyWimsWidgets.inputSelect(name, {
      texts: draw.choices?.[name], order: draw.orders?.[name], idPrefix, inline: attributes.inline ?? false
    }),
    read: ([select]) => select.value === "" ? null : Number(select.value),
    layout: prompt => PyWimsWidgets.fitSelects(prompt),
    showSolution(inputs, field, draw, prompt) {
      return PyWimsWidgets.defaults.showSolution.call(this, inputs, field, draw)
        .then(() => PyWimsWidgets.fitSelects(prompt));
    }
  });
}
