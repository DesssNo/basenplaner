package io.github.desssno.mcpainter.bridge;

import com.google.gson.JsonArray;
import com.google.gson.JsonObject;
import io.github.desssno.mcpainter.MCPainter;
import io.github.desssno.mcpainter.bridge.BridgeServer.ApiException;
import io.github.desssno.mcpainter.bridge.BridgeServer.Request;
import io.github.desssno.mcpainter.build.BuildJob;
import io.github.desssno.mcpainter.build.BuildManager;
import io.github.desssno.mcpainter.build.Job;
import io.github.desssno.mcpainter.build.SpongeSchematic;
import io.github.desssno.mcpainter.build.UndoStore;
import net.minecraft.SharedConstants;
import net.minecraft.commands.arguments.blocks.BlockStateParser;
import net.minecraft.core.BlockPos;
import net.minecraft.server.MinecraftServer;
import net.minecraft.server.level.ServerPlayer;
import net.minecraft.world.level.block.state.BlockState;
import net.neoforged.fml.ModList;

import java.io.IOException;
import java.util.HashMap;
import java.util.Locale;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.ExecutionException;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.TimeoutException;
import java.util.function.Function;
import java.util.function.Supplier;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * Die Endpunkte der Brücke (Konzept Abschnitt 4). Alles, was die Welt betrifft, läuft auf dem Server-Thread.
 * Einzelspieler: Der Client sagt uns, welcher Server und welcher Spieler gemeint sind ({@link #setContext}).
 */
public final class Api {
    private static final Pattern JOB = Pattern.compile("^/api/build/([\\w-]+)(/cancel)?$");
    private static final int MAX_READ_VOLUME = 1_000_000;

    private static volatile Supplier<MinecraftServer> serverSupplier = () -> null;
    private static volatile Supplier<UUID> playerSupplier = () -> null;

    private Api() {
    }

    public static void setContext(Supplier<MinecraftServer> server, Supplier<UUID> player) {
        serverSupplier = server;
        playerSupplier = player;
    }

    /** Nur im Entwicklungs-Autotest gesetzt: {@code POST /api/dev/quit} beendet das Spiel. */
    private static volatile Runnable devQuit;

    public static void setDevQuit(Runnable quit) {
        devQuit = quit;
    }

    static JsonObject handle(Request r) {
        String path = r.path();
        boolean get = r.method().equals("GET"), post = r.method().equals("POST");
        if (post && path.equals("/api/dev/quit") && devQuit != null) {
            devQuit.run();
            return new JsonObject();
        }
        if (get && path.equals("/api/hello")) return hello();
        if (post && path.equals("/api/build")) return build(r);
        if (post && path.equals("/api/undo")) return undo();
        if (get && path.equals("/api/world/blocks")) return worldBlocks(r);
        Matcher m = JOB.matcher(path);
        if (m.matches()) {
            String id = m.group(1);
            if (get && m.group(2) == null) return onServer(s -> job(id).toJson());
            if (post && m.group(2) != null) return onServer(s -> {
                job(id).cancel();
                return job(id).toJson();
            });
        }
        throw new ApiException(404, "Unbekannter Endpunkt " + r.method() + " " + path);
    }

    // ---------- Endpunkte ----------

    private static JsonObject hello() {
        JsonObject o = new JsonObject();
        o.addProperty("mod", MCPainter.MODID);
        o.addProperty("version", ModList.get().getModContainerById(MCPainter.MODID)
                .map(c -> c.getModInfo().getVersion().toString()).orElse("?"));
        o.addProperty("minecraft", SharedConstants.getCurrentVersion().getName());
        MinecraftServer server = serverSupplier.get();
        o.addProperty("inWorld", server != null);
        if (server == null) return o;
        return onServer(s -> {
            o.addProperty("world", s.getWorldData().getLevelName());
            ServerPlayer p = player(s);
            o.addProperty("canBuild", canBuild(s, p));
            o.addProperty("busy", BuildManager.busy());
            o.addProperty("undoCount", UndoStore.count(s));
            if (p != null) {
                o.addProperty("dimension", p.level().dimension().location().toString());
                JsonObject pl = new JsonObject();
                pl.addProperty("name", p.getGameProfile().getName());
                pl.addProperty("x", p.getX());
                pl.addProperty("y", p.getY());
                pl.addProperty("z", p.getZ());
                pl.addProperty("yaw", p.getYRot());
                pl.addProperty("pitch", p.getXRot());
                o.add("player", pl);
            }
            return o;
        });
    }

    /** Body: Sponge-Schematic. Query: {@code overwrite=none|air_fluids|all}, {@code clearAir=true|false}. */
    private static JsonObject build(Request r) {
        BuildJob.Overwrite overwrite;
        try {
            overwrite = BuildJob.Overwrite.valueOf(r.param("overwrite", "all").toUpperCase(Locale.ROOT));
        } catch (IllegalArgumentException e) {
            throw new ApiException(400, "overwrite muss none, air_fluids oder all sein");
        }
        boolean clearAir = Boolean.parseBoolean(r.param("clearAir", "false"));
        SpongeSchematic schem;
        try {
            schem = SpongeSchematic.read(r.body());
        } catch (IOException | RuntimeException e) {
            throw new ApiException(400, "Plan nicht lesbar: " + e.getMessage());
        }
        return onServer(s -> {
            ServerPlayer p = player(s);
            if (!canBuild(s, p)) throw new ApiException(403, "Bauen dürfen nur der Welt-Besitzer oder OPs (Level 2).");
            BuildJob job = BuildManager.build(p.serverLevel(), schem, overwrite, clearAir);
            JsonObject o = job.toJson();
            o.addProperty("jobId", job.id);
            return o;
        });
    }

    private static JsonObject undo() {
        return onServer(s -> {
            if (!canBuild(s, player(s))) throw new ApiException(403, "Rückgängig dürfen nur der Welt-Besitzer oder OPs (Level 2).");
            Job job;
            try {
                job = BuildManager.undo(s);
            } catch (IOException e) {
                throw new ApiException(500, "Undo-Daten nicht lesbar: " + e.getMessage());
            }
            if (job == null) throw new ApiException(404, "Es gibt keinen Bau, der sich rückgängig machen lässt.");
            JsonObject o = job.toJson();
            o.addProperty("jobId", job.id);
            return o;
        });
    }

    /** Vorhandene Blöcke eines Bereichs: {@code {origin, size, palette, data}} mit data[(y*L+z)*W+x]. */
    private static JsonObject worldBlocks(Request r) {
        int x1 = r.intParam("x1"), y1 = r.intParam("y1"), z1 = r.intParam("z1");
        int x2 = r.intParam("x2"), y2 = r.intParam("y2"), z2 = r.intParam("z2");
        int ax = Math.min(x1, x2), ay = Math.min(y1, y2), az = Math.min(z1, z2);
        int w = Math.abs(x2 - x1) + 1, h = Math.abs(y2 - y1) + 1, l = Math.abs(z2 - z1) + 1;
        if ((long) w * h * l > MAX_READ_VOLUME) throw new ApiException(400, "Bereich zu groß (höchstens " + MAX_READ_VOLUME + " Blöcke)");
        return onServer(s -> {
            ServerPlayer p = player(s);
            if (p == null) throw new ApiException(409, "Kein Spieler in der Welt");
            var level = p.serverLevel();
            Map<BlockState, Integer> index = new HashMap<>();
            JsonArray palette = new JsonArray();
            JsonArray data = new JsonArray();
            BlockPos.MutableBlockPos pos = new BlockPos.MutableBlockPos();
            for (int y = 0; y < h; y++) {
                for (int z = 0; z < l; z++) {
                    for (int x = 0; x < w; x++) {
                        BlockState st = level.getBlockState(pos.set(ax + x, ay + y, az + z));
                        Integer i = index.get(st);
                        if (i == null) {
                            i = index.size();
                            index.put(st, i);
                            palette.add(BlockStateParser.serialize(st));
                        }
                        data.add(i);
                    }
                }
            }
            JsonObject o = new JsonObject();
            JsonArray origin = new JsonArray();
            origin.add(ax);
            origin.add(ay);
            origin.add(az);
            JsonArray size = new JsonArray();
            size.add(w);
            size.add(h);
            size.add(l);
            o.add("origin", origin);
            o.add("size", size);
            o.add("palette", palette);
            o.add("data", data);
            return o;
        });
    }

    // ---------- Hilfen ----------

    private static Job job(String id) {
        Job j = BuildManager.get(id);
        if (j == null) throw new ApiException(404, "Auftrag " + id + " unbekannt");
        return j;
    }

    private static ServerPlayer player(MinecraftServer s) {
        UUID id = playerSupplier.get();
        ServerPlayer p = id == null ? null : s.getPlayerList().getPlayer(id);
        if (p == null && !s.getPlayerList().getPlayers().isEmpty()) p = s.getPlayerList().getPlayers().get(0);
        return p;
    }

    /** Bauen dürfen der Welt-Besitzer im Einzelspieler und OPs ab Level 2 (Konzept Abschnitt 4). */
    private static boolean canBuild(MinecraftServer s, ServerPlayer p) {
        return p != null && (s.isSingleplayerOwner(p.getGameProfile()) || p.hasPermissions(2));
    }

    /** Führt {@code fn} auf dem Server-Thread aus und wartet auf das Ergebnis. */
    private static JsonObject onServer(Function<MinecraftServer, JsonObject> fn) {
        MinecraftServer server = serverSupplier.get();
        if (server == null) throw new ApiException(409, "Keine Welt geöffnet");
        try {
            return server.submit(() -> fn.apply(server)).get(15, TimeUnit.SECONDS);
        } catch (ExecutionException e) {
            if (e.getCause() instanceof ApiException a) throw a;
            throw new ApiException(500, "Fehler im Spiel: " + e.getCause());
        } catch (TimeoutException e) {
            throw new ApiException(503, "Das Spiel antwortet nicht (Zeitüberschreitung)");
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            throw new ApiException(503, "Abgebrochen");
        }
    }
}
