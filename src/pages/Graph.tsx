import { KnowledgeGraph } from '../components/KnowledgeGraph'
import { PageHead } from '../components/ui'
import { useVault } from '../state/vault'

export default function GraphPage() {
  const { model } = useVault()
  return (
    <div className="page page-graph">
      <PageHead eyebrow="Obsidian" title="Graph-Ansicht" lead="Dieselbe Ansicht wie in Obsidian: Filter, Farbgruppen und Kräfte stellst du in Obsidian ein, sie gelten hier automatisch mit." />
      <KnowledgeGraph graph={model.graph} mode="full" />
    </div>
  )
}
