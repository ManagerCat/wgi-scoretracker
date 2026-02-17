import { Button } from "./ui/button";

// Filter toggle button used on index page sections
export function FilterButton({ active, onClick, label = "Filters" }) {
  return (
    <Button
      type="button"
      onClick={onClick}
      variant={active ? "default" : "outline"}
      size="sm"
      aria-pressed={!!active}
      className="gap-2"
    >
      ⚙ {label}
    </Button>
  );
}
