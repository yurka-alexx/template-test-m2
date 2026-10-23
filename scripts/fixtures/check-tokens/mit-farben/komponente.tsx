// Beispiel für check:tokens: Jede Zeile mit "Fund: …" muss genau mit diesem Treffer gemeldet werden.
export function Kaputt() {
  return (
    <div className="bg-slate-500 p-4">{/* Fund: bg-slate-500 */}
      <span className="text-white">Text</span>{/* Fund: text-white */}
      <span className="hover:border-red-500/50">Rand</span>{/* Fund: border-red-500/50 */}
      <span className="bg-[#123456]">Hex in Klasse</span>{/* Fund: #123456 */}
      <span style={{ color: "#fff" }}>Hex im Stil</span>{/* Fund: #fff */}
      <span style={{ color: "rgb(0 0 0)" }}>RGB</span>{/* Fund: rgb( */}
    </div>
  );
}
