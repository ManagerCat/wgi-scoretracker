import { useParams } from 'react-router-dom';
import EventPage from './EventPage';

export default function Event() {
  const { id } = useParams();
  // Pass id via a wrapper that simulates the query param behavior
  return <EventPageWithId eventId={id} />;
}

function EventPageWithId({ eventId }) {
  return <EventPage eventId={eventId} />;
}
