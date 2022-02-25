import { useCurrentViewContext } from 'context/useCurrentView';
import Chronicle from './chronicle';
import Journals from './journals';
import Tasks from './tasks';
import Graph from './graph';
import NotePage from './md';

export default function MainView() {
  const currentView = useCurrentViewContext();
  const viewTy = currentView.state.view;
  // 
  return (
    <>
      {viewTy === 'chronicle' ? (
        <Chronicle />
      ) : viewTy === 'task' ? (
        <Tasks />
      ) : viewTy === 'graph' ? (
        <Graph />
      ) : viewTy === 'journal' ? (
        <Journals />
      ) : (
        <NotePage />
      )}
    </>
  );
}
