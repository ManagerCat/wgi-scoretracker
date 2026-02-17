import { useParams } from 'react-router-dom';
import GroupPage from './GroupPage';

export default function Group() {
  const { id } = useParams();
  return <GroupPageWithId groupId={id} />;
}

function GroupPageWithId({ groupId }) {
  return <GroupPage groupId={groupId} />;
}
