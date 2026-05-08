import { getProjects } from '../../lib/queries';

export default async function ProjectsPage() {
  const projects = await getProjects();

  return (
    <section className="space-y-4">
      <h2 className="text-2xl font-semibold">Projects</h2>
      {projects.length === 0 ? <p className="text-slate-300">No projects yet. Seed demo data via API.</p> : null}
      <div className="space-y-3">
        {projects.map((project) => (
          <article key={project.id} className="rounded-xl border border-line bg-panel p-4">
            <div className="flex items-start justify-between">
              <div>
                <h3 className="text-lg font-medium">{project.name}</h3>
                <p className="text-sm text-slate-300">{project.description}</p>
              </div>
              <a href={`/projects/${project.id}`}>View details</a>
            </div>
            <p className="mt-2 text-sm text-slate-300">
              Packets: {project.packets.length} | Results: {project.results.length}
            </p>
          </article>
        ))}
      </div>
    </section>
  );
}
