package io.github.desssno.mcpainter.world;

import com.google.gson.JsonArray;
import com.google.gson.JsonObject;
import net.minecraft.Util;
import net.minecraft.core.BlockPos;
import net.minecraft.core.Holder;
import net.minecraft.network.chat.Component;
import net.minecraft.resources.ResourceLocation;
import net.minecraft.server.level.ServerLevel;
import net.minecraft.tags.BiomeTags;
import net.minecraft.world.level.biome.Biome;
import net.minecraft.world.level.biome.BiomeSource;
import net.minecraft.world.level.biome.Climate;
import net.minecraft.world.level.block.state.BlockState;
import net.minecraft.world.level.chunk.ChunkGenerator;
import net.minecraft.world.level.chunk.LevelChunk;
import net.minecraft.world.level.levelgen.Heightmap;
import net.minecraft.world.level.levelgen.RandomState;
import net.minecraft.world.level.material.MapColor;

import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.Locale;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

/**
 * Biom- und Oberflächenkarte aus dem echten Weltgenerator (Konzept Abschnitt 5). Kennt alle Modpack-Biome,
 * weil sich Biom-Mods genau dort einhängen.
 * <ul>
 *   <li>Biome: {@code biomeSource.getNoiseBiome(…, randomState.sampler())} – schnell, auch für nie generierte Chunks</li>
 *   <li>Höhe: geschätzt mit {@code generator.getBaseHeight(…)} auf einem groben Raster</li>
 *   <li>Oberfläche (optional): echte Höhe und Kartenfarbe des obersten Blocks in geladenen Chunks</li>
 * </ul>
 */
public final class BiomeMapper {
    public static final int MAX_SAMPLES = 128 * 128;
    private static final Map<String, JsonObject> biomeInfo = new ConcurrentHashMap<>();

    private BiomeMapper() {
    }

    /** Was nur auf dem Server-Thread gelesen werden darf: echte Höhen und Farben aus geladenen Chunks. */
    public record Surface(int[] heights, int[] colors) {
    }

    /**
     * Auf dem Server-Thread aufrufen. Für Proben in geladenen Chunks: Höhe des obersten Blocks und seine
     * Kartenfarbe; sonst Höhe {@link Integer#MIN_VALUE} und Farbe -1.
     */
    public static Surface surface(ServerLevel level, int x1, int z1, int step, int nx, int nz) {
        int[] heights = new int[nx * nz], colors = new int[nx * nz];
        BlockPos.MutableBlockPos pos = new BlockPos.MutableBlockPos();
        for (int j = 0; j < nz; j++) {
            for (int i = 0; i < nx; i++) {
                int x = x1 + i * step + step / 2, z = z1 + j * step + step / 2, k = j * nx + i;
                LevelChunk chunk = level.getChunkSource().getChunkNow(x >> 4, z >> 4);
                if (chunk == null) {
                    heights[k] = Integer.MIN_VALUE;
                    colors[k] = -1;
                    continue;
                }
                int y = chunk.getHeight(Heightmap.Types.WORLD_SURFACE, x & 15, z & 15);
                BlockState state = chunk.getBlockState(pos.set(x, y, z));
                MapColor c = state.getMapColor(level, pos);
                heights[k] = y;
                colors[k] = c == MapColor.NONE ? -1 : c.col & 0xffffff;
            }
        }
        return new Surface(heights, colors);
    }

    /**
     * Darf außerhalb des Server-Threads laufen (Klima-Noise und Höhenschätzung sind thread-sicher,
     * die Weltgenerierung nutzt sie selbst parallel).
     *
     * @param surface echte Werte aus {@link #surface}, oder {@code null}
     */
    public static JsonObject map(ServerLevel level, int x1, int z1, int step, int nx, int nz, Surface surface) {
        ChunkGenerator generator = level.getChunkSource().getGenerator();
        RandomState random = level.getChunkSource().randomState();
        BiomeSource source = generator.getBiomeSource();
        Climate.Sampler sampler = random.sampler();

        // Höhe: grobes Raster (jede 8. Probe), dazwischen bilinear – getBaseHeight ist der teure Teil.
        // Rasterpunkte werden nur berechnet, wenn eine Probe ohne echte Höhe sie braucht.
        int g = 8, gx = (nx - 1) / g + 2, gz = (nz - 1) / g + 2;
        int[] grid = new int[gx * gz];
        java.util.Arrays.fill(grid, Integer.MIN_VALUE);
        java.util.function.IntBinaryOperator gridAt = (i, j) -> {
            int k = j * gx + i;
            if (grid[k] == Integer.MIN_VALUE) {
                int x = x1 + i * g * step + step / 2, z = z1 + j * g * step + step / 2;
                grid[k] = generator.getBaseHeight(x, z, Heightmap.Types.WORLD_SURFACE_WG, level, random);
            }
            return grid[k];
        };
        int[] heights = new int[nx * nz], biomes = new int[nx * nz];
        Map<Holder<Biome>, Integer> index = new LinkedHashMap<>();
        Map<Integer, Holder<Biome>> byIndex = new HashMap<>();
        for (int j = 0; j < nz; j++) {
            for (int i = 0; i < nx; i++) {
                int k = j * nx + i;
                int h;
                if (surface != null && surface.heights()[k] != Integer.MIN_VALUE) {
                    h = surface.heights()[k];
                } else {
                    double fx = (double) i / g, fz = (double) j / g;
                    int ix = (int) fx, iz = (int) fz;
                    double tx = fx - ix, tz = fz - iz;
                    double a = gridAt.applyAsInt(ix, iz), b = gridAt.applyAsInt(ix + 1, iz);
                    double c = gridAt.applyAsInt(ix, iz + 1), d = gridAt.applyAsInt(ix + 1, iz + 1);
                    h = (int) Math.round((a * (1 - tx) + b * tx) * (1 - tz) + (c * (1 - tx) + d * tx) * tz);
                }
                heights[k] = h;
                int x = x1 + i * step + step / 2, z = z1 + j * step + step / 2;
                // Biom deutlich über der Oberfläche abfragen: Höhlenbiome gibt es im Klimamodell nur „unter der Erde“,
                // darüber gewinnt immer das Oberflächenbiom. Der Abstand fängt auch Fehler der Höhenschätzung
                // in Bergen ab (dort liegt die interpolierte Höhe oft deutlich unter dem Gipfel).
                int by = Math.min(Math.max(h, level.getSeaLevel()) + 64, level.getMaxBuildHeight() - 1);
                Holder<Biome> biome = source.getNoiseBiome(x >> 2, by >> 2, z >> 2, sampler);
                Integer idx = index.get(biome);
                if (idx == null) {
                    idx = index.size();
                    index.put(biome, idx);
                    byIndex.put(idx, biome);
                }
                biomes[k] = idx;
            }
        }

        JsonObject out = new JsonObject();
        JsonArray palette = new JsonArray();
        for (int i = 0; i < index.size(); i++) palette.add(info(byIndex.get(i)));
        out.add("palette", palette);
        out.addProperty("nx", nx);
        out.addProperty("nz", nz);
        out.add("biomes", ints(biomes));
        out.add("heights", ints(heights));
        if (surface != null) out.add("colors", ints(surface.colors()));
        return out;
    }

    private static JsonArray ints(int[] a) {
        JsonArray arr = new JsonArray(a.length);
        for (int v : a) arr.add(v);
        return arr;
    }

    /** ID, Name in der Spielsprache, Mod und eine Farbe (Gras- bzw. Wasserfarbe) für ein Biom. */
    private static JsonObject info(Holder<Biome> biome) {
        String id = biome.unwrapKey().map(k -> k.location().toString()).orElse("unbekannt:biom");
        return biomeInfo.computeIfAbsent(id, key -> {
            ResourceLocation loc = ResourceLocation.tryParse(key);
            JsonObject o = new JsonObject();
            o.addProperty("id", key);
            String langKey = loc == null ? key : Util.makeDescriptionId("biome", loc);
            String name = Component.translatable(langKey).getString();
            if (name.equals(langKey) && loc != null) name = pretty(loc.getPath());
            o.addProperty("name", name);
            o.addProperty("mod", loc == null ? "?" : BlockCatalog.modName(loc.getNamespace()));
            int color;
            try {
                boolean water = biome.is(BiomeTags.IS_OCEAN) || biome.is(BiomeTags.IS_RIVER);
                color = water ? biome.value().getWaterColor() : biome.value().getGrassColor(0, 0);
            } catch (RuntimeException e) {
                color = key.hashCode();
            }
            o.addProperty("color", String.format(Locale.ROOT, "#%06x", color & 0xffffff));
            return o;
        });
    }

    private static String pretty(String path) {
        String s = path.substring(path.lastIndexOf('/') + 1).replace('_', ' ');
        return s.isEmpty() ? path : Character.toUpperCase(s.charAt(0)) + s.substring(1);
    }
}
