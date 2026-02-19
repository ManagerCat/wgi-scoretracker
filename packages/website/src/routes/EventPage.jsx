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
  abbreviateLabel,
  fetchDocument,
  formatDate,
  formatDateRange,
  getEventDateText,
  getEventLocation,
  normalizeDate,
  slugify,
} from "../utils";

function RecapTable({ recap }) {
  const navigate = useNavigate();
  const captionLabels = Array.isArray(recap.captions) ? recap.captions : [];
  const groups = Array.isArray(recap.groups) ? recap.groups : [];
  const label = recap.division || recap.name || "Division";
  const slug = slugify(label);

  return (
    <section id={slug} className="grid gap-2 mt-3">
      <h3 className="meta font-semibold">{label}</h3>
      <div className="overflow-x-auto rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="whitespace-nowrap">Group</TableHead>
              {captionLabels.map((lab) => (
                <TableHead key={lab} className="text-right">
                  {lab}
                </TableHead>
              ))}
              <TableHead className="text-right">Subtotal</TableHead>
              <TableHead className="text-right">Total</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {groups.map((g) => (
              <TableRow
                className="cursor-pointer"
                onClick={() => navigate(`/group/${g.groupId}`)}
                key={g.groupId}
              >
                <TableCell className="whitespace-nowrap font-medium">
                  {g.name}
                </TableCell>
                {captionLabels.map((_, idx) => (
                  <TableCell key={idx} className="text-right">
                    {Array.isArray(g.captions) && g.captions[idx] != null
                      ? g.captions[idx]
                      : ""}
                  </TableCell>
                ))}
                <TableCell className="text-right">
                  {g.subtotal != null ? g.subtotal : ""}
                </TableCell>
                <TableCell className="text-right">
                  {g.total != null ? g.total : ""}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </section>
  );
}

export default function EventPage({ eventId: propId }) {
  const eventId = useMemo(
    () => propId || new URLSearchParams(window.location.search).get("id"),
    [propId],
  );
  const [eventDoc, setEventDoc] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    async function loadEvent() {
      if (!eventId) {
        setError("No event id provided.");
        setLoading(false);
        return;
      }
      try {
        const doc = await fetchDocument("events", eventId);
        setEventDoc(doc);
      } catch (err) {
        setError(err.message || "Failed to load event.");
      } finally {
        setLoading(false);
      }
    }
    loadEvent();
  }, [eventId]);

  if (loading) {
    return (
      <main className="max-w-4xl mx-auto my-7 px-4">
        <div className="text-gray-600">Loading…</div>
      </main>
    );
  }

  if (error || !eventDoc) {
    return (
      <main className="max-w-4xl mx-auto my-7 px-4">
        <div className="text-red-600">{error || "Event not found."}</div>
      </main>
    );
  }

  const dateText = getEventDateText(eventDoc);
  const locationText = getEventLocation(eventDoc);
  const subtitleParts = [];
  if (dateText) subtitleParts.push(dateText);
  if (locationText) subtitleParts.push(locationText);
  if (eventDoc.circuit) subtitleParts.push(eventDoc.circuit);
  const subtitle = subtitleParts.join(" — ");

  const recapDates = Array.isArray(eventDoc.recaps)
    ? eventDoc.recaps
        .map((r) => normalizeDate(r && r.date))
        .filter((d) => d instanceof Date)
    : [];
  const recapRange = formatDateRange(recapDates);

  return (
    <main className="max-w-4xl mx-auto my-7 px-4 grid gap-6">
      <header className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold">
            {eventDoc.name || eventDoc.id}
          </h1>
          <p className="text-sm text-gray-600">
            <Button asChild variant="link" className="h-auto p-0">
              <Link to="/">Back to list</Link>
            </Button>
          </p>
        </div>
        {eventDoc.id && (
          <Button asChild variant="outline">
            <Link to={`/map?center=${encodeURIComponent(eventDoc.id)}`}>
              Open on map
            </Link>
          </Button>
        )}
      </header>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle>{eventDoc.name || eventDoc.id}</CardTitle>
          {subtitle && <CardDescription>{subtitle}</CardDescription>}
        </CardHeader>
        <CardContent className="grid gap-2 pt-0">
          {eventDoc.recapUrl ? (
            <Button asChild variant="outline" className="self-start">
              <a
                href={String(eventDoc.recapUrl)}
                target="_blank"
                rel="noopener noreferrer"
              >
                See Full Recap
              </a>
            </Button>
          ) : null}
          {recapRange && (
            <div className="text-sm text-muted-foreground">
              Recap dates: {recapRange}
            </div>
          )}
        </CardContent>
      </Card>

      {Array.isArray(eventDoc.recaps) && eventDoc.recaps.length ? (
        <>
          <div className="flex flex-wrap gap-2">
            {eventDoc.recaps.map((rec) => {
              const label = rec.division || rec.name || "Division";
              const slug = slugify(label);
              const abbr = abbreviateLabel(label);
              return (
                <Button
                  key={slug}
                  asChild
                  variant="outline"
                  size="sm"
                  title={label}
                  aria-label={label}
                >
                  <a href={`#${slug}`}>{abbr || label}</a>
                </Button>
              );
            })}
          </div>

          {eventDoc.recaps.map((rec) => (
            <RecapTable
              recap={rec}
              key={rec.division || rec.name || rec.slug}
            />
          ))}
        </>
      ) : (
        <div className="text-gray-600">No recaps available.</div>
      )}
    </main>
  );
}
