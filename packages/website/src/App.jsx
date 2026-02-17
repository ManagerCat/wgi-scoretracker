import React, { useState, useEffect, useMemo } from "react";
import { Link } from "react-router-dom";
import { EventCard, GroupCard, Pager, FilterButton } from "./components";
import { Button } from "./components/ui/button";
import { Card, CardContent } from "./components/ui/card";
import {
  fetchCollection,
  getEventDate,
  getEventLocation,
  getGroupScore,
} from "./utils";

function App() {
  const [events, setEvents] = useState([]);
  const [groups, setGroups] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Filter states for events
  const [eventSearchTerm, setEventSearchTerm] = useState("");
  const [eventCircuitFilter, setEventCircuitFilter] = useState("");
  const [eventLocationFilter, setEventLocationFilter] = useState("");
  const [eventSortBy, setEventSortBy] = useState("date-desc");
  const [eventsShowFilters, setEventsShowFilters] = useState(false);
  const [eventsPage, setEventsPage] = useState(1);
  const EVENTS_PAGE_SIZE = 12;

  // Filter states for groups
  const [groupSearchTerm, setGroupSearchTerm] = useState("");
  const [groupCircuitFilter, setGroupCircuitFilter] = useState("");
  const [groupDivisionFilter, setGroupDivisionFilter] = useState("");
  const [groupSortBy, setGroupSortBy] = useState("score-desc");
  const [groupsShowFilters, setGroupsShowFilters] = useState(false);
  const [groupsPage, setGroupsPage] = useState(1);
  const GROUPS_PAGE_SIZE = 24;

  // Reset pagination when filters/sort/search change
  useEffect(() => {
    setEventsPage(1);
  }, [eventSearchTerm, eventCircuitFilter, eventLocationFilter, eventSortBy]);

  useEffect(() => {
    setGroupsPage(1);
  }, [groupSearchTerm, groupCircuitFilter, groupDivisionFilter, groupSortBy]);

  // Initialize and fetch data
  useEffect(() => {
    async function loadData() {
      try {
        // Fetch events
        const eventCandidates = ["events", "event"];
        let fetchedEvents = [];
        for (const coll of eventCandidates) {
          try {
            fetchedEvents = await fetchCollection(coll);
            if (fetchedEvents.length > 0) break;
          } catch (e) {
            console.warn(`Could not fetch from ${coll}:`, e);
          }
        }

        // Fetch groups
        const groupCandidates = ["groups"];
        let fetchedGroups = [];
        for (const coll of groupCandidates) {
          try {
            fetchedGroups = await fetchCollection(coll);
            if (fetchedGroups.length > 0) break;
          } catch (e) {
            console.warn(`Could not fetch from ${coll}:`, e);
          }
        }

        setEvents(fetchedEvents);
        setGroups(fetchedGroups);
        setLoading(false);
      } catch (err) {
        setError(err.message);
        setLoading(false);
      }
    }

    loadData();
  }, []);

  // Filtered and sorted events
  const filteredEvents = useMemo(() => {
    let filtered = events;

    // Search filter
    if (eventSearchTerm) {
      const term = eventSearchTerm.toLowerCase();
      filtered = filtered.filter((ev) => {
        const name = (ev.name || ev.id || "").toLowerCase();
        const circuit = (ev.circuit || "").toLowerCase();
        const location = getEventLocation(ev).toLowerCase();
        return (
          name.includes(term) ||
          circuit.includes(term) ||
          location.includes(term)
        );
      });
    }

    // Circuit filter
    if (eventCircuitFilter) {
      filtered = filtered.filter((ev) =>
        (ev.circuit || "")
          .toLowerCase()
          .includes(eventCircuitFilter.toLowerCase()),
      );
    }

    // Location filter
    if (eventLocationFilter) {
      filtered = filtered.filter((ev) =>
        getEventLocation(ev)
          .toLowerCase()
          .includes(eventLocationFilter.toLowerCase()),
      );
    }

    // Sort
    filtered = [...filtered].sort((a, b) => {
      if (eventSortBy === "date-desc" || eventSortBy === "date-asc") {
        const dateA = getEventDate(a);
        const dateB = getEventDate(b);
        if (!dateA && !dateB) return 0;
        if (!dateA) return 1;
        if (!dateB) return -1;
        const diff = dateA.getTime() - dateB.getTime();
        return eventSortBy === "date-desc" ? -diff : diff;
      }
      if (eventSortBy === "name-asc" || eventSortBy === "name-desc") {
        const nameA = (a.name || a.id || "").toLowerCase();
        const nameB = (b.name || b.id || "").toLowerCase();
        const cmp = nameA.localeCompare(nameB);
        return eventSortBy === "name-desc" ? -cmp : cmp;
      }
      return 0;
    });

    return filtered;
  }, [
    events,
    eventSearchTerm,
    eventCircuitFilter,
    eventLocationFilter,
    eventSortBy,
  ]);

  // Paginated events
  const totalEventsPages = Math.max(
    1,
    Math.ceil(filteredEvents.length / EVENTS_PAGE_SIZE),
  );
  const paginatedEvents = useMemo(() => {
    const start = (eventsPage - 1) * EVENTS_PAGE_SIZE;
    return filteredEvents.slice(start, start + EVENTS_PAGE_SIZE);
  }, [filteredEvents, eventsPage]);

  // Filtered and sorted groups
  const filteredGroups = useMemo(() => {
    let filtered = groups;
    // Division filter
    if (groupDivisionFilter) {
      filtered = filtered.filter((g) =>
        (g.division || "")
          .toLowerCase()
          .includes(groupDivisionFilter.toLowerCase()),
      );
    }
    // Search filter
    if (groupSearchTerm) {
      const term = groupSearchTerm.toLowerCase();
      filtered = filtered.filter((g) => {
        const name = (g.name || g.id || "").toLowerCase();
        const circuit = (g.circuit || "").toLowerCase();
        const event = (g.event || "").toLowerCase();
        return (
          name.includes(term) || circuit.includes(term) || event.includes(term)
        );
      });
    }

    // Circuit filter
    if (groupCircuitFilter) {
      filtered = filtered.filter((g) =>
        (g.circuit || "")
          .toLowerCase()
          .includes(groupCircuitFilter.toLowerCase()),
      );
    }

    // Sort
    filtered = [...filtered].sort((a, b) => {
      if (groupSortBy === "score-desc" || groupSortBy === "score-asc") {
        // console.log(a.scores[a.scores.length - 1].scores.Total);
        const scoreA =
          a.scores[a.scores.length - 1]?.scores?.Total ?? -Infinity;
        const scoreB =
          b.scores[b.scores.length - 1]?.scores?.Total ?? -Infinity;
        const diff = scoreA - scoreB;
        return groupSortBy === "score-desc" ? -diff : diff;
      }
      if (groupSortBy === "name-asc" || groupSortBy === "name-desc") {
        const nameA = (a.name || a.id || "").toLowerCase();
        const nameB = (b.name || b.id || "").toLowerCase();
        const cmp = nameA.localeCompare(nameB);
        return groupSortBy === "name-desc" ? -cmp : cmp;
      }
      return 0;
    });

    return filtered;
  }, [
    groups,
    groupSearchTerm,
    groupCircuitFilter,
    groupDivisionFilter,
    groupSortBy,
  ]);

  // Paginated groups
  const totalGroupsPages = Math.max(
    1,
    Math.ceil(filteredGroups.length / GROUPS_PAGE_SIZE),
  );
  const paginatedGroups = useMemo(() => {
    const start = (groupsPage - 1) * GROUPS_PAGE_SIZE;
    return filteredGroups.slice(start, start + GROUPS_PAGE_SIZE);
  }, [filteredGroups, groupsPage]);

  // Unique circuits and locations for filters
  const circuits = useMemo(() => {
    const set = new Set();
    events.forEach((e) => e.circuit && set.add(e.circuit));
    groups.forEach((g) => g.circuit && set.add(g.circuit));
    return Array.from(set).sort();
  }, [events, groups]);

  const locations = useMemo(() => {
    const set = new Set();
    events.forEach((e) => {
      const loc = getEventLocation(e);
      if (loc) set.add(loc);
    });
    return Array.from(set).sort();
  }, [events]);

  const eventNames = useMemo(() => {
    const set = new Set();
    groups.forEach((g) => g.event && set.add(g.event));
    return Array.from(set).sort();
  }, [groups]);

  const divisions = useMemo(() => {
    const set = new Set();
    groups.forEach((g) => g.division && set.add(g.division));
    return Array.from(set).sort();
  }, [groups]);

  if (loading) {
    return (
      <main className="max-w-7xl mx-auto my-7 px-4">
        <div className="text-center text-gray-600">Loading data...</div>
      </main>
    );
  }

  if (error) {
    return (
      <main className="max-w-7xl mx-auto my-7 px-4">
        <div className="text-center text-red-600">Error: {error}</div>
      </main>
    );
  }

  return (
    <main className="max-w-5xl mx-auto my-7 px-4 grid grid-cols-1 lg:grid-cols-2 gap-8">
      {/* Header with map link */}
      <header className="col-span-full flex items-center justify-between gap-3 mb-4">
        <h1 className="text-2xl font-bold">WGI Scoretracker</h1>
        <Button
          asChild
          variant="outline"
          size="icon"
          title="Open events map"
          aria-label="Open events map"
        >
          <Link to="/map">
            <svg
              className="w-5 h-5"
              viewBox="0 0 24 24"
              fill="none"
              xmlns="http://www.w3.org/2000/svg"
              aria-hidden="true"
            >
              <path
                d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7z"
                stroke="currentColor"
                strokeWidth="1.2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
              <circle cx="12" cy="9" r="2.2" fill="currentColor" />
            </svg>
          </Link>
        </Button>
      </header>
      {/* Events Section */}
      <section>
        <h2 className="text-lg font-semibold mb-3 flex items-center gap-2">
          Events
          <FilterButton
            active={eventsShowFilters}
            onClick={() => setEventsShowFilters(!eventsShowFilters)}
          />
        </h2>

        {eventsShowFilters && (
          <Card className="mb-4">
            <CardContent className="p-3 space-y-2">
              <input
                type="text"
                placeholder="Search events..."
                value={eventSearchTerm}
                onChange={(e) => setEventSearchTerm(e.target.value)}
                className="w-full px-3 py-2 border border-input rounded-md bg-background"
              />
              <div className="grid grid-cols-2 gap-2">
                <select
                  value={eventCircuitFilter}
                  onChange={(e) => setEventCircuitFilter(e.target.value)}
                  className="px-3 py-2 border border-input rounded-md bg-background"
                >
                  <option value="">All Circuits</option>
                  {circuits.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
                <select
                  value={eventLocationFilter}
                  onChange={(e) => setEventLocationFilter(e.target.value)}
                  className="px-3 py-2 border border-input rounded-md bg-background"
                >
                  <option value="">All Locations</option>
                  {locations.map((l) => (
                    <option key={l} value={l}>
                      {l}
                    </option>
                  ))}
                </select>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button
                  type="button"
                  onClick={() => setEventSortBy("date-desc")}
                  variant={eventSortBy === "date-desc" ? "default" : "outline"}
                  size="sm"
                >
                  Date ↓
                </Button>
                <Button
                  type="button"
                  onClick={() => setEventSortBy("date-asc")}
                  variant={eventSortBy === "date-asc" ? "default" : "outline"}
                  size="sm"
                >
                  Date ↑
                </Button>
                <Button
                  type="button"
                  onClick={() => setEventSortBy("name-asc")}
                  variant={eventSortBy === "name-asc" ? "default" : "outline"}
                  size="sm"
                >
                  Name A-Z
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        <div className="grid grid-cols-2 gap-3" id="events-list">
          {paginatedEvents.length === 0 ? (
            <div className="col-span-2 text-gray-600">No events found.</div>
          ) : (
            paginatedEvents.map((event) => (
              <EventCard key={event.id} event={event} />
            ))
          )}
        </div>

        {filteredEvents.length > EVENTS_PAGE_SIZE && (
          <Pager
            currentPage={eventsPage}
            totalPages={totalEventsPages}
            onPageChange={setEventsPage}
          />
        )}
      </section>

      {/* Groups Section */}
      <section>
        <h2 className="text-lg font-semibold mb-3 flex items-center gap-2">
          Groups
          <FilterButton
            active={groupsShowFilters}
            onClick={() => setGroupsShowFilters(!groupsShowFilters)}
          />
        </h2>

        {groupsShowFilters && (
          <Card className="mb-4">
            <CardContent className="p-3 space-y-2">
              <input
                type="text"
                placeholder="Search groups..."
                value={groupSearchTerm}
                onChange={(e) => setGroupSearchTerm(e.target.value)}
                className="w-full px-3 py-2 border border-input rounded-md bg-background"
              />
              <div className="grid grid-cols-2 gap-2">
                <select
                  value={groupCircuitFilter}
                  onChange={(e) => setGroupCircuitFilter(e.target.value)}
                  className="px-3 py-2 border border-input rounded-md bg-background"
                >
                  <option value="">All Circuits</option>
                  {circuits.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
                <select
                  value={groupDivisionFilter}
                  onChange={(e) => setGroupDivisionFilter(e.target.value)}
                  className="px-3 py-2 border border-input rounded-md bg-background"
                >
                  <option value="">All Divisions</option>
                  {divisions.map((d) => (
                    <option key={d} value={d}>
                      {d}
                    </option>
                  ))}
                </select>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button
                  type="button"
                  onClick={() => setGroupSortBy("score-desc")}
                  variant={groupSortBy === "score-desc" ? "default" : "outline"}
                  size="sm"
                >
                  Score ↓
                </Button>
                <Button
                  type="button"
                  onClick={() => setGroupSortBy("score-asc")}
                  variant={groupSortBy === "score-asc" ? "default" : "outline"}
                  size="sm"
                >
                  Score ↑
                </Button>
                <Button
                  type="button"
                  onClick={() => setGroupSortBy("name-asc")}
                  variant={groupSortBy === "name-asc" ? "default" : "outline"}
                  size="sm"
                >
                  Name A-Z
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        <div className="grid grid-cols-2 gap-3" id="groups-list">
          {paginatedGroups.length === 0 ? (
            <div className="col-span-2 text-gray-600">No groups found.</div>
          ) : (
            paginatedGroups.map((group) => (
              <GroupCard key={group.id} group={group} />
            ))
          )}
        </div>

        {filteredGroups.length > GROUPS_PAGE_SIZE && (
          <Pager
            currentPage={groupsPage}
            totalPages={totalGroupsPages}
            onPageChange={setGroupsPage}
          />
        )}
      </section>
    </main>
  );
}

export default App;
