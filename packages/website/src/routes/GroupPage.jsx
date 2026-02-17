import React, { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Button } from "../components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "../components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "../components/ui/table";
import {
  fetchDocument,
  formatDate,
  normalizeDate,
  getEventDate,
} from "../utils";

function dateToISO(d) {
  if (!d) return null;
  const dt = d instanceof Date ? d : normalizeDate(d);
  if (!dt) return null;
  const yyyy = dt.getFullYear();
  const mm = String(dt.getMonth() + 1).padStart(2, "0");
  const dd = String(dt.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

export default function GroupPage({ groupId: propId }) {
  const navigate = useNavigate();
  const groupId = useMemo(
    () => propId || new URLSearchParams(window.location.search).get("id"),
    [propId],
  );
  const [groupDoc, setGroupDoc] = useState(null);
  const [eventById, setEventById] = useState({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    async function loadGroup() {
      if (!groupId) {
        setError("No group id provided.");
        setLoading(false);
        return;
      }
      try {
        const doc = await fetchDocument("groups", groupId);
        setGroupDoc(doc);
      } catch (err) {
        setError(err.message || "Failed to load group.");
      } finally {
        setLoading(false);
      }
    }
    loadGroup();
  }, [groupId]);

  console.log(groupDoc);

  useEffect(() => {
    let cancelled = false;
    async function loadEventDocs() {
      if (!groupDoc || !groupDoc.scores) return;
      const ids = groupDoc.scores.map((score) => score.eventId);
      if (!ids.length) return;
      const results = {};
      await Promise.all(
        ids.map(async (id) => {
          try {
            const doc = await fetchDocument("events", id);
            if (doc) results[id] = doc;
          } catch (e) {
            results[id] = null;
          }
        }),
      );
      if (!cancelled) setEventById(results);
    }
    loadEventDocs();
    return () => {
      cancelled = true;
    };
  }, [groupDoc]);

  if (loading) {
    return (
      <main className="max-w-4xl mx-auto my-7 px-4">
        <div className="text-gray-600">Loading…</div>
      </main>
    );
  }

  if (error || !groupDoc) {
    return (
      <main className="max-w-4xl mx-auto my-7 px-4">
        <div className="text-red-600">{error || "Group not found."}</div>
      </main>
    );
  }

  let headers = [];

  groupDoc.scores.forEach((score) => {
    headers = [...new Set([...headers, ...Object.keys(score.scores)])];
  });

  const tailHeaders = ["Subtotal", "Total"];
  const headerSet = new Set(headers);
  headers = headers.filter((header) => !tailHeaders.includes(header));
  headers = [
    ...headers,
    ...tailHeaders.filter((header) => headerSet.has(header)),
  ];

  const sortedScores = [...groupDoc.scores].sort((a, b) => {
    const aMs =
      a?.date && a.date._seconds != null
        ? a.date._seconds * 1000 + (a.date._nanoseconds || 0) / 1000000
        : 0;
    const bMs =
      b?.date && b.date._seconds != null
        ? b.date._seconds * 1000 + (b.date._nanoseconds || 0) / 1000000
        : 0;
    return bMs - aMs;
  });

  const tableRows = sortedScores.map((score, index) => {
    const jsDate = new Date(
      score.date._seconds * 1000 + score.date._nanoseconds / 1000000,
    );
    return (
      <TableRow
        key={index}
        className="cursor-pointer"
        onClick={() => navigate(`/event/${score.eventId}`)}
      >
        <TableCell>{eventById[score.eventId]?.name}</TableCell>
        <TableCell>
          {jsDate.toLocaleDateString("en-US", {
            month: "short",
            day: "numeric",
          })}
        </TableCell>
        <TableCell>{eventById[score.eventId]?.circuit || ""}</TableCell>
        {headers.map((header) => (
          <TableCell key={`${score.eventId}-${header}`}>
            {score && score.scores[header] != null ? score.scores[header] : ""}
          </TableCell>
        ))}
      </TableRow>
    );
  });

  return (
    <main className="max-w-4xl mx-auto my-7 px-4 grid gap-6">
      <header className="flex items-center justify-between gap-4">
        <div>
          <Button variant="outline" className="h-auto p-1 mb-5">
            <Link to="/">Back to list</Link>
          </Button>
          <h1 className="text-xl font-semibold">{groupDoc.name}</h1>
          <h2 className="text-sm text-gray-500">{groupDoc.division}</h2>
          <p className="text-sm text-gray-600"></p>
        </div>
      </header>

      <Card>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Event Name</TableHead>
              <TableHead>Event Date</TableHead>
              <TableHead>Event Circuit</TableHead>
              {headers.map((header) => (
                <TableHead key={header}>{header}</TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>{tableRows}</TableBody>
        </Table>
      </Card>
    </main>
  );
}
