// Beispiel für check:tokens: nur Token-Klassen und Dinge, die wie Farben aussehen, aber keine sind.
export function Sauber() {
  return (
    <div id="add-item" className="bg-primary/90 p-4 text-primary-foreground text-sm">
      <a href="#root" className="border-border ring-ring/50 hover:bg-accent">
        Link &#123;
      </a>
      <span className="from-primary to-transparent bg-overlay text-destructive">Text</span>
    </div>
  );
}
