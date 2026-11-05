package io.github.desssno.mcpainter.build;

import io.github.desssno.mcpainter.MCPainter;
import net.minecraft.core.BlockPos;
import net.minecraft.core.registries.BuiltInRegistries;
import net.minecraft.nbt.CompoundTag;
import net.minecraft.nbt.ListTag;
import net.minecraft.nbt.LongArrayTag;
import net.minecraft.nbt.IntArrayTag;
import net.minecraft.nbt.NbtAccounter;
import net.minecraft.nbt.NbtIo;
import net.minecraft.nbt.NbtUtils;
import net.minecraft.nbt.Tag;
import net.minecraft.server.MinecraftServer;
import net.minecraft.world.level.block.Block;
import net.minecraft.world.level.block.state.BlockState;
import net.minecraft.world.level.storage.LevelResource;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.stream.Stream;

/**
 * Vorher-Zustände der letzten Bauten, gespeichert unter {@code <welt>/data/mcpainter/undo/} (Konzept Abschnitt 7).
 * Überlebt einen Neustart; behalten werden die letzten {@link #KEEP} Bauten.
 */
public final class UndoStore {
    public static final int KEEP = 5;

    private UndoStore() {
    }

    /** Was ein Bau verändert hat: Position, alter Zustand und ggf. alte Block-Entity-Daten. */
    public static final class Record {
        public final String dimension;
        long[] pos = new long[256];
        int[] state = new int[256];
        int size;
        final List<BlockState> palette = new ArrayList<>();
        final Map<BlockState, Integer> paletteIndex = new HashMap<>();
        final Map<Integer, CompoundTag> blockEntities = new HashMap<>();

        public Record(String dimension) {
            this.dimension = dimension;
        }

        public void add(BlockPos p, BlockState old, CompoundTag blockEntity) {
            if (size == pos.length) {
                pos = Arrays.copyOf(pos, size * 2);
                state = Arrays.copyOf(state, size * 2);
            }
            Integer idx = paletteIndex.get(old);
            if (idx == null) {
                idx = palette.size();
                palette.add(old);
                paletteIndex.put(old, idx);
            }
            if (blockEntity != null) blockEntities.put(size, blockEntity);
            pos[size] = p.asLong();
            state[size] = idx;
            size++;
        }

        public int size() {
            return size;
        }

        public long pos(int i) {
            return pos[i];
        }

        public BlockState state(int i) {
            return palette.get(state[i]);
        }

        public CompoundTag blockEntity(int i) {
            return blockEntities.get(i);
        }

        CompoundTag save() {
            CompoundTag tag = new CompoundTag();
            tag.putString("dimension", dimension);
            ListTag pal = new ListTag();
            for (BlockState s : palette) pal.add(NbtUtils.writeBlockState(s));
            tag.put("palette", pal);
            tag.put("pos", new LongArrayTag(Arrays.copyOf(pos, size)));
            tag.put("state", new IntArrayTag(Arrays.copyOf(state, size)));
            ListTag bes = new ListTag();
            blockEntities.forEach((i, nbt) -> {
                CompoundTag e = new CompoundTag();
                e.putInt("i", i);
                e.put("nbt", nbt);
                bes.add(e);
            });
            tag.put("blockEntities", bes);
            return tag;
        }

        static Record load(CompoundTag tag) {
            Record r = new Record(tag.getString("dimension"));
            for (Tag t : tag.getList("palette", Tag.TAG_COMPOUND)) {
                BlockState s = NbtUtils.readBlockState(BuiltInRegistries.BLOCK.asLookup(), (CompoundTag) t);
                r.paletteIndex.putIfAbsent(s, r.palette.size());
                r.palette.add(s);
            }
            r.pos = tag.getLongArray("pos");
            r.state = tag.getIntArray("state");
            r.size = Math.min(r.pos.length, r.state.length);
            for (Tag t : tag.getList("blockEntities", Tag.TAG_COMPOUND)) {
                CompoundTag e = (CompoundTag) t;
                r.blockEntities.put(e.getInt("i"), e.getCompound("nbt"));
            }
            return r;
        }
    }

    static Path dir(MinecraftServer server) {
        return server.getWorldPath(LevelResource.ROOT).resolve("data").resolve(MCPainter.MODID).resolve("undo");
    }

    public static void save(MinecraftServer server, String id, Record record) {
        if (record.size == 0) return;
        try {
            Path d = dir(server);
            Files.createDirectories(d);
            NbtIo.writeCompressed(record.save(), d.resolve(id + ".nbt"));
            List<Path> all = list(server);
            for (int i = 0; i < all.size() - KEEP; i++) Files.deleteIfExists(all.get(i));
        } catch (IOException e) {
            MCPainter.LOGGER.error("MCPainter: Undo-Daten für {} nicht gespeichert", id, e);
        }
    }

    /** Gespeicherte Bauten, ältester zuerst (Dateinamen beginnen mit der Uhrzeit). */
    static List<Path> list(MinecraftServer server) throws IOException {
        Path d = dir(server);
        if (!Files.isDirectory(d)) return List.of();
        try (Stream<Path> s = Files.list(d)) {
            return s.filter(p -> p.getFileName().toString().endsWith(".nbt")).sorted().toList();
        }
    }

    /** Neuester gespeicherter Bau oder {@code null}. */
    public static Path latest(MinecraftServer server) {
        try {
            List<Path> all = list(server);
            return all.isEmpty() ? null : all.get(all.size() - 1);
        } catch (IOException e) {
            return null;
        }
    }

    public static int count(MinecraftServer server) {
        try {
            return list(server).size();
        } catch (IOException e) {
            return 0;
        }
    }

    static Record load(Path file) throws IOException {
        return Record.load(NbtIo.readCompressed(file, NbtAccounter.unlimitedHeap()));
    }

    /** Ohne Physik setzen: keine Nachbar-Updates, keine Drops (Konzept Abschnitt 7.5). */
    public static final int QUIET = Block.UPDATE_CLIENTS | Block.UPDATE_KNOWN_SHAPE | Block.UPDATE_SUPPRESS_DROPS;
}
