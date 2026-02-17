import { getEventDateText } from "../utils";
import { Link } from "react-router-dom";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "./ui/card";

// EventCard component - displays event information
export function EventCard({ event, onClick }) {
  const { circuit, name, id } = event;
  const dateText = getEventDateText(event);
  const displayName = name || id || "Event";
  const circuitText = circuit || "";

  return (
    <Link to={`/event/${id}`} className="block" onClick={onClick}>
      <Card className="hover:shadow-md transition-shadow">
        <CardHeader className="pb-2">
          <CardTitle className="text-base">{displayName}</CardTitle>
          {circuitText && <CardDescription>{circuitText}</CardDescription>}
        </CardHeader>
        {dateText && (
          <CardContent className="pt-0 text-sm text-muted-foreground">
            {dateText}
          </CardContent>
        )}
      </Card>
    </Link>
  );
}
