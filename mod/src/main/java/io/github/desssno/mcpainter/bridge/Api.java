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
import io.github.desssno.mcpainter.world.BiomeMapper;
import io.github.desssno.mcpainter.world.BlockCatalog;
import com.google.gson.JsonNull;
import net.minecraft.core.registries.BuiltInRegistries;
import net.minecraft.server.level.ServerLevel;
import net.minecraft.world.item.BlockItem;
import net.minecraft.world.item.ItemStack;
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
    private static volatile Runnable uiReady = () -> {};
    private static volatile Runnable uiClose = () -> {};

    public static void setDevQuit(Runnable quit) {
        devQuit = quit;
    }

    /** Der Editor im Spiel meldet sich bereit bzw. möchte den Bildschirm schließen (Esc ohne offenen Dialog). */
    public static void setUiHooks(Runnable ready, Runnable close) {
        uiReady = ready;
        uiClose = close;
    }

    static JsonObject handle(Request r) {
        String path = r.path();
        boolean get = r.method().equals("GET"), post = r.method().equals("POST");
        if (post && path.equals("/api/dev/quit") && devQuit != null) {
            devQuit.run();
            return new JsonObject();
        }
        if (post && path.equals("/api/ui/ready")) {
            uiReady.run();
            return new JsonObject();
        }
        if (post && path.equals("/api/ui/close")) {
            uiClose.run();
            return new JsonObject();
        }
        if (get && path.equals("/api/blocks")) return BlockCatalog.get();
        if (get && path.equals("/api/world/biomes")) return worldMap(r, false);
        if (get && path.equals("/api/world/surface")) return worldMap(r, true);
        if (get && path.equals("/api/player/hotbar")) return hotbar();
        if (post && path.equals("/api/teleport")) return teleport(r);
        if (get && path.equals("/api/plan")) return PlanStore.load(onServerPath());
        if (post && path.equals("/api/plan")) return PlanStore.save(onServerPath(), r.body());
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

    /**
     * Karte aus dem echten Weltgenerator der Dimension des Spielers: {@code x1,z1,x2,z2,step}.
     * Proben in der Mitte jeder Zelle; Antwort siehe {@link BiomeMapper#map}.
     */
    private static JsonObject worldMap(Request r, boolean surface) {
        int x1 = r.intParam("x1"), z1 = r.intParam("z1"), x2 = r.intParam("x2"), z2 = r.intParam("z2");
        int step = Math.max(1, r.intParam("step"));
        int nx = (Math.abs(x2 - x1) + 1) / step, nz = (Math.abs(z2 - z1) + 1) / step;
        if (nx < 1 || nz < 1) throw new ApiException(400, "Bereich kleiner als ein Schritt");
        if ((long) nx * nz > BiomeMapper.MAX_SAMPLES) throw new ApiException(400, "Zu viele Proben (höchstens " + BiomeMapper.MAX_SAMPLES + ")");
        int ax = Math.min(x1, x2), az = Math.min(z1, z2);
        Object[] ctx = onServerGet(s -> {
            ServerPlayer p = player(s);
            if (p == null) throw new ApiException(409, "Kein Spieler in der Welt");
            ServerLevel level = p.serverLevel();
            return new Object[]{level, surface ? BiomeMapper.surface(level, ax, az, step, nx, nz) : null};
        });
        // Biome und Höhenschätzung außerhalb des Server-Threads, damit das Spiel flüssig bleibt
        return BiomeMapper.map((ServerLevel) ctx[0], ax, az, step, nx, nz, (BiomeMapper.Surface) ctx[1]);
    }

    /** Block-IDs der Spieler-Hotbar (null für leere Plätze und Gegenstände, die keine Blöcke sind). */
    private static JsonObject hotbar() {
        return onServer(s -> {
            ServerPlayer p = player(s);
            if (p == null) throw new ApiException(409, "Kein Spieler in der Welt");
            JsonArray slots = new JsonArray();
            for (int i = 0; i < 9; i++) {
                ItemStack stack = p.getInventory().getItem(i);
                if (stack.getItem() instanceof BlockItem bi) slots.add(BuiltInRegistries.BLOCK.getKey(bi.getBlock()).toString());
                else slots.add(JsonNull.INSTANCE);
            }
            JsonObject o = new JsonObject();
            o.add("slots", slots);
            o.addProperty("selected", p.getInventory().selected);
            return o;
        });
    }

    /** Teleportiert den Spieler (Query {@code x}, {@code y}, {@code z}, Blockmitte wird ergänzt). */
    private static JsonObject teleport(Request r) {
        int x = r.intParam("x"), y = r.intParam("y"), z = r.intParam("z");
        return onServer(s -> {
            ServerPlayer p = player(s);
            if (!canBuild(s, p)) throw new ApiException(403, "Teleportieren dürfen nur der Welt-Besitzer oder OPs (Level 2).");
            p.teleportTo(p.serverLevel(), x + 0.5, y, z + 0.5, p.getYRot(), p.getXRot());
            JsonObject o = new JsonObject();
            o.addProperty("ok", true);
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

    /** Ordner der geöffneten Welt. */
    private static java.nio.file.Path onServerPath() {
        MinecraftServer server = serverSupplier.get();
        if (server == null) throw new ApiException(409, "Keine Welt geöffnet");
        return server.getWorldPath(net.minecraft.world.level.storage.LevelResource.ROOT);
    }

    private static JsonObject onServer(Function<MinecraftServer, JsonObject> fn) {
        return onServerGet(fn);
    }

    /** Führt {@code fn} auf dem Server-Thread aus und wartet auf das Ergebnis. */
    private static <T> T onServerGet(Function<MinecraftServer, T> fn) {
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
