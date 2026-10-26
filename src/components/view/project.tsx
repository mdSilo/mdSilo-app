import { useState } from 'react';
import { TbLayoutBoardSplit as IconBoard, TbTable as IconTable, TbPlus as IconPlus } from 'react-icons/tb';
import { useStore } from 'lib/store';
import ErrorBoundary from 'components/misc/ErrorBoundary';
import { BaseModal } from 'components/settings/BaseModal';
import { useCurrentViewContext } from 'context/useCurrentView';
import { useIssueData, useIssueStore } from 'components/issue/issueStore';
import { createProject, deleteProject, getIssue, moveProjectItem, updateProject } from 'components/issue/issueOps';
import { btnClass, inputClass } from 'components/issue/common';
import IssueDetail from 'components/issue/IssueDetail';
import ProjectBoard from 'components/issue/project/ProjectBoard';
import ProjectTable from 'components/issue/project/ProjectTable';

export default function ProjectView() {
  const { data, isLoaded, initDir } = useIssueData();
  const apply = useIssueStore((s) => s.apply);
  const createIssue = useIssueStore((s) => s.createIssue);
  const { state, dispatch } = useCurrentViewContext();
  const [openIssue, setOpenIssue] = useState<number | null>(null);
  const [newProject, setNewProject] = useState('');

  if (!initDir) {
    return <p className="p-8 text-base-content/60">Open a folder to use projects.</p>;
  }
  if (!isLoaded) {
    return <p className="p-8 text-base-content/60">Loading projects…</p>;
  }

  const project = data.projects.find((p) => p.id === state.projectId) ?? data.projects[0];
  const select = (projectId: string) => dispatch({ view: 'project', projectId });

  const addItem = (statusId: string, text: string) => {
    if (!project) return;
    const ref = text.match(/^#(\d+)$/);
    const existing = ref ? getIssue(data, Number(ref[1])) : undefined;
    if (existing) {
      const order = project.items.filter((it) => it.status === statusId).length;
      apply((d) => moveProjectItem(d, project.id, existing.number, statusId, order));
    } else {
      createIssue({ title: text, project: { id: project.id, status: statusId } });
    }
  };

  const onCreateProject = () => {
    const title = newProject.trim();
    if (!title) return;
    const id = useIssueStore.getState().data.projects.length;
    apply((d) => createProject(d, title));
    const created = useIssueStore.getState().data.projects[id];
    setNewProject('');
    if (created) select(created.id);
  };

  return (
    <ErrorBoundary>
      <div className="flex flex-col w-full h-full overflow-hidden bg-base-100">
        <div className="flex flex-wrap items-center gap-2 px-4 py-2 border-b border-base-300">
          {data.projects.map((p) => (
            <button
              type="button"
              key={p.id}
              aria-pressed={p.id === project?.id}
              className={`px-2 py-1 rounded-sm ${p.id === project?.id ? 'bg-base-300 font-semibold' : 'hover:bg-base-content/5'}`}
              onClick={() => select(p.id)}
            >
              {p.title}
            </button>
          ))}
          <input
            aria-label="New project"
            className={inputClass}
            placeholder="New project"
            value={newProject}
            onChange={(e) => setNewProject(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') onCreateProject(); }}
          />
          <button type="button" aria-label="Create project" className={btnClass} onClick={onCreateProject}>
            <IconPlus size={14} />
          </button>
          <span className="flex-1" />
          <button type="button" className={btnClass} onClick={() => dispatch({ view: 'issues' })}>Issues</button>
        </div>

        {project ? (
          <>
            <div className="flex flex-wrap items-center gap-2 px-4 py-2">
              <h1 className="text-xl font-semibold">{project.title}</h1>
              <button
                type="button"
                className="text-sm ms-link"
                onClick={() => {
                  const title = window.prompt('Project name', project.title);
                  if (title) apply((d) => updateProject(d, project.id, { title }));
                }}
              >
                Rename
              </button>
              <button
                type="button"
                className="text-sm text-error hover:underline"
                onClick={() => {
                  if (window.confirm(`Delete project "${project.title}"? Issues are kept.`)) {
                    apply((d) => deleteProject(d, project.id));
                    dispatch({ view: 'project' });
                  }
                }}
              >
                Delete
              </button>
              <span className="flex-1" />
              <div className="flex overflow-hidden border border-base-300 rounded-sm" role="group" aria-label="Layout">
                {(['board', 'table'] as const).map((layout) => (
                  <button
                    type="button"
                    key={layout}
                    aria-pressed={project.layout === layout}
                    className={`flex items-center gap-1 px-2 py-1 text-sm ${project.layout === layout ? 'bg-base-300' : ''}`}
                    onClick={() => apply((d) => updateProject(d, project.id, { layout }))}
                  >
                    {layout === 'board' ? <IconBoard size={14} /> : <IconTable size={14} />}
                    {layout === 'board' ? 'Board' : 'Table'}
                  </button>
                ))}
              </div>
            </div>
            <div className="flex-1 overflow-auto">
              {project.layout === 'table' ? (
                <ProjectTable project={project} data={data} onOpen={setOpenIssue} />
              ) : (
                <ProjectBoard project={project} data={data} onOpen={setOpenIssue} onAddItem={addItem} />
              )}
            </div>
          </>
        ) : (
          <p className="p-8 text-base-content/60">No projects yet. Create one above.</p>
        )}

        <BaseModal
          title=""
          isOpen={openIssue !== null}
          handleClose={() => setOpenIssue(null)}
          panelClassName="max-w-5xl"
        >
          {openIssue !== null ? (
            <div className="h-[75vh] text-left">
              <IssueDetail number={openIssue} onClose={() => setOpenIssue(null)} />
            </div>
          ) : null}
        </BaseModal>
      </div>
    </ErrorBoundary>
  );
}
