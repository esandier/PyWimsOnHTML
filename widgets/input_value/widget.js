// Valeur numérique (SPECIFICATION.md, § 2.8) : saisie dans un champ texte (virgule, fraction, « ×10^ »,
// que le pavé numérique d’un téléphone ne permet pas), comparée exactement à la tolérance près et dans
// la forme demandée. La solution du tirage est { text, value } : le texte qu’écrit « Solution », la
// fraction exacte que compare la correction ; « question_check » reçoit la valeur lue, un Rational.
PyWimsWidgets.define("input_value", {
  render: ({ name, attributes }, { idPrefix }) =>
    PyWimsWidgets.inputText(name, { style: attributes.style || "", idPrefix, inline: attributes.inline ?? false }),
  verdicts(answer, { name, attributes }, draw) {
    const { valueVerdict, formHint } = PyWimsCorrection;
    const solution = draw.solutions[name];
    if (solution === null) {
      return { verdicts: { [name]: typeof answer === "string" && answer.trim() !== "" }, hints: {} };
    }
    const verdict = valueVerdict(answer, solution, attributes);
    return {
      verdicts: { [name]: verdict === "correct" },
      hints: verdict === "form" ? { [name]: formHint(attributes.form) } : {}
    };
  },
  sendToPython(python, { name }, answer, draw, values) {
    values[name] = PyWimsCorrection.exactValue(answer);
  },
  typedAnswer: ({ name }, draw) => draw.solutions[name]?.text ?? "1",
  solutionOf: (input, { name }, draw) => draw.solutions[name]?.text ?? null
});
