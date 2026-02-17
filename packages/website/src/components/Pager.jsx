import { Button } from "./ui/button";

// Pager component - pagination controls
export function Pager({ currentPage, totalPages, onPageChange }) {
  return (
    <div className="pager flex gap-2 items-center justify-center mt-3">
      <Button
        type="button"
        onClick={() => onPageChange(currentPage - 1)}
        disabled={currentPage <= 1}
        variant="outline"
        size="sm"
        aria-label="Previous page"
      >
        ‹ Prev
      </Button>
      <span className="text-sm text-gray-600">
        Page {currentPage} of {totalPages}
      </span>
      <Button
        type="button"
        onClick={() => onPageChange(currentPage + 1)}
        disabled={currentPage >= totalPages}
        variant="outline"
        size="sm"
        aria-label="Next page"
      >
        Next ›
      </Button>
    </div>
  );
}
