package io.github.desssno.mcpainter.build;

import io.github.desssno.mcpainter.MCPainter;
import net.minecraft.server.MinecraftServer;
import net.minecraft.server.level.ServerLevel;
import net.neoforged.neoforge.common.NeoForge;
import net.neoforged.neoforge.event.server.ServerStoppingEvent;
import net.neoforged.neoforge.event.tick.ServerTickEvent;

import java.io.IOException;
import java.util.ArrayDeque;
import java.util.Deque;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.concurrent.atomic.AtomicInteger;

/**
 * Warteschlange der Aufträge. Läuft nur auf dem Server-Thread: Pro Tick wird höchstens
 * {@link #BUDGET_NANOS} gearbeitet, damit das Spiel flüssig bleibt (Konzept Abschnitt 7.3).
 */
public final class BuildManager {
    public static final long BUDGET_NANOS = 5_000_000L;
    private static final int KEEP_FINISHED = 20;

    private static final Deque<Job> queue = new ArrayDeque<>();
    private static final Map<String, Job> jobs = new LinkedHashMap<>();
    private static final AtomicInteger counter = new AtomicInteger();
    private static Job current;

    private BuildManager() {
    }

    public static void register() {
        NeoForge.EVENT_BUS.addListener(ServerTickEvent.Post.class, e -> tick());
        NeoForge.EVENT_BUS.addListener(ServerStoppingEvent.class, e -> stopAll());
    }

    private static String nextId(String prefix) {
        // beginnt mit der Uhrzeit, damit Undo-Dateien nach Alter sortiert sind
        return System.currentTimeMillis() + "-" + prefix + counter.incrementAndGet();
    }

    public static BuildJob build(ServerLevel level, SpongeSchematic schem, BuildJob.Overwrite overwrite, boolean clearAir) {
        BuildJob job = new BuildJob(nextId("b"), level, schem, overwrite, clearAir);
        add(job);
        MCPainter.LOGGER.info("MCPainter: Bau {} mit {} Blöcken bei {} {} {}, {} unbekannte Blockarten",
                job.id, job.total, schem.offsetX(), schem.offsetY(), schem.offsetZ(), job.unknownBlocks.size());
        return job;
    }

    /** Macht den neuesten Bau rückgängig. Läuft gerade noch ein Bau, wird er erst abgebrochen. */
    public static Job undo(MinecraftServer server) throws IOException {
        if (current instanceof BuildJob) current.stopNow();
        for (Job j : queue) j.stopNow();
        queue.clear();
        current = null;
        UndoJob job = UndoJob.latest(server, nextId("u"));
        if (job == null) return null;
        add(job);
        MCPainter.LOGGER.info("MCPainter: Rückgängig {} ({} Blöcke)", job.id, job.total);
        return job;
    }

    private static void add(Job job) {
        queue.add(job);
        jobs.put(job.id, job);
        while (jobs.size() > KEEP_FINISHED) {
            String oldest = jobs.keySet().iterator().next();
            if (!jobs.get(oldest).isFinished()) break;
            jobs.remove(oldest);
        }
    }

    public static Job get(String id) {
        return jobs.get(id);
    }

    public static boolean busy() {
        return current != null || !queue.isEmpty();
    }

    private static void tick() {
        if (current == null) current = queue.poll();
        if (current == null) return;
        try {
            if (current.tick(System.nanoTime() + BUDGET_NANOS)) {
                MCPainter.LOGGER.info("MCPainter: Auftrag {} beendet: {}", current.id, current.state());
                current = null;
            }
        } catch (RuntimeException e) {
            MCPainter.LOGGER.error("MCPainter: Auftrag {} fehlgeschlagen", current.id, e);
            current = null;
        }
    }

    /** Welt wird geschlossen: laufende Bauten abbrechen, Undo-Daten sichern. */
    private static void stopAll() {
        if (current != null) current.stopNow();
        for (Job j : queue) j.stopNow();
        queue.clear();
        jobs.clear();
        current = null;
    }
}
