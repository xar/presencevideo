<script lang="ts">
    import { AlertCircle, AlertTriangle, Info, CheckCircle2 } from 'lucide-svelte';
    import { projectStore, selectionStore, timelineStore } from '@/lib/editor';
    import { formatTimelineTime } from '@/lib/editor/formatting';
    import { lintProject } from '@/lib/editor/model/lint';
    import type { LintIssue, LintSeverity } from '@/lib/editor/model/lint';
    import { LINT_PROFILES } from '@/lib/editor/model/lint-profiles';
    import type { LintProfileId } from '@/lib/editor/model/lint-profiles';

    /**
     * The "is this ready to post?" panel.
     *
     * It shows exactly what the agents' `lint_video_project` tool sees: the
     * same `lintProject()` over the same project. Clicking an issue selects the
     * offending element or scene and moves the playhead to it.
     */

    let profile = $state<LintProfileId>('tiktok');

    let report = $derived.by(() => {
        // Depend on the edit counter so the lint re-runs on any mutation, and
        // hand lint a plain snapshot rather than the live `$state` proxy.
        void projectStore.editVersion;
        const project = projectStore.project;
        if (!project) return null;
        return lintProject($state.snapshot(project), { profile });
    });

    const ORDER: LintSeverity[] = ['error', 'warning', 'info'];

    let grouped = $derived.by(() => {
        const issues = report?.issues ?? [];
        return ORDER.map((severity) => ({
            severity,
            issues: issues.filter((issue) => issue.severity === severity),
        })).filter((group) => group.issues.length > 0);
    });

    function scoreTone(score: number): string {
        if (score >= 80) return 'text-emerald-500';
        if (score >= 50) return 'text-amber-500';
        return 'text-destructive';
    }

    function locateElement(issue: LintIssue): void {
        const project = projectStore.project;
        if (!project || !issue.elementId) return;

        for (const scene of project.scenes) {
            if (scene.layers.some((layer) => layer.id === issue.elementId)) {
                selectionStore.selectLayer(scene.id, issue.elementId);
                return;
            }
        }

        for (const track of project.video_tracks) {
            if (track.clips.some((clip) => clip.id === issue.elementId)) {
                selectionStore.selectVideoClip(track.id, issue.elementId);
                return;
            }
        }
    }

    function open(issue: LintIssue): void {
        if (issue.elementId) {
            locateElement(issue);
        } else if (issue.sceneId) {
            selectionStore.selectScene(issue.sceneId);
        }

        if (typeof issue.timeMs === 'number') {
            timelineStore.setCurrentTime(issue.timeMs);
        }
    }

    const LABELS: Record<LintSeverity, string> = {
        error: 'Must fix',
        warning: 'Should fix',
        info: 'Nice to have',
    };
</script>

<div class="flex h-full flex-col overflow-hidden">
    <div class="flex items-center justify-between gap-2 border-b px-4 py-3">
        <div>
            <p class="text-xs text-muted-foreground">Readiness</p>
            {#if report}
                <p class="text-2xl font-semibold tabular-nums {scoreTone(report.score)}">
                    {report.score}<span class="text-sm text-muted-foreground">/100</span>
                </p>
            {/if}
        </div>
        <select
            bind:value={profile}
            class="h-8 rounded-md border bg-transparent px-2 text-xs"
            aria-label="Platform profile"
        >
            {#each Object.values(LINT_PROFILES) as option (option.id)}
                <option value={option.id}>{option.label}</option>
            {/each}
        </select>
    </div>

    <div class="flex-1 overflow-y-auto">
        {#if !report}
            <p class="p-4 text-sm text-muted-foreground">No project loaded.</p>
        {:else if report.issues.length === 0}
            <div class="flex flex-col items-center gap-2 p-8 text-center">
                <CheckCircle2 class="h-8 w-8 text-emerald-500" />
                <p class="text-sm font-medium">Ready to post</p>
                <p class="text-xs text-muted-foreground">
                    Nothing flagged for {LINT_PROFILES[profile].label}.
                </p>
            </div>
        {:else}
            {#each grouped as group (group.severity)}
                <div class="border-b">
                    <p class="px-4 pt-3 pb-1 text-[11px] font-medium tracking-wide text-muted-foreground uppercase">
                        {LABELS[group.severity]} · {group.issues.length}
                    </p>
                    <ul>
                        {#each group.issues as issue (issue.id)}
                            <li>
                                <button
                                    type="button"
                                    class="flex w-full items-start gap-2 px-4 py-2 text-left hover:bg-accent"
                                    onclick={() => open(issue)}
                                >
                                    {#if issue.severity === 'error'}
                                        <AlertCircle class="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
                                    {:else if issue.severity === 'warning'}
                                        <AlertTriangle class="mt-0.5 h-4 w-4 shrink-0 text-amber-500" />
                                    {:else}
                                        <Info class="mt-0.5 h-4 w-4 shrink-0 text-sky-500" />
                                    {/if}
                                    <span class="min-w-0 flex-1">
                                        <span class="block text-sm leading-snug">{issue.message}</span>
                                        {#if issue.fix}
                                            <span class="block text-xs text-muted-foreground">{issue.fix}</span>
                                        {/if}
                                    </span>
                                    {#if typeof issue.timeMs === 'number'}
                                        <span class="shrink-0 text-[11px] text-muted-foreground tabular-nums">
                                            {formatTimelineTime(issue.timeMs)}
                                        </span>
                                    {/if}
                                </button>
                            </li>
                        {/each}
                    </ul>
                </div>
            {/each}
        {/if}
    </div>
</div>
