import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "./ui/card";
import { normalizeDate, formatDate } from "../utils";
import { Link } from "react-router-dom";

// GroupCard component - displays group information
export function GroupCard({ group }) {
  const { id, name, circuit, event, scores, division } = group;
  // console.log(group.scores)
  // iterate group.scores and find the schild with the latest date
  let latestScore = null;
  let latestDate = null;
  for (const score of scores) {
    const date = normalizeDate(score.date);
    if (date && (!latestDate || date > latestDate)) {
      latestDate = date;
      latestScore = score.scores;
    }
  }
  const total = latestScore.Total || null;

  // Date handling: support various Firestore JSON timestamp formats and aggregated _date
  const dateVal = normalizeDate(group && (group._date || group.date));
  const dateStr = dateVal ? formatDate(dateVal) : "";

  return (
    <Link to={`/group/${id}`} className="block">
      <Card className="hover:shadow-md transition-shadow">
        <CardHeader className="pb-2">
          <CardTitle className="text-base">{name}</CardTitle>
          {<CardDescription>{division}</CardDescription>}
        </CardHeader>
        {(total || dateStr) && (
          <CardContent className="pt-0 text-sm text-muted-foreground">
            {total ? `Score: ${total}, ${circuit}` : ""}
            {dateStr ? (
              <>
                {total ? <br /> : null}
                Date: {dateStr}
              </>
            ) : null}
          </CardContent>
        )}
      </Card>
    </Link>
  );
}
