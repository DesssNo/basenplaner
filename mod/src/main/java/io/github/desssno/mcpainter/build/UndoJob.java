package io.github.desssno.mcpainter.build;

import io.github.desssno.mcpainter.MCPainter;
import net.minecraft.core.BlockPos;
import net.minecraft.core.registries.Registries;
import net.minecraft.nbt.CompoundTag;
import net.minecraft.resources.ResourceKey;
import net.minecraft.resources.ResourceLocation;
import net.minecraft.server.MinecraftServer;
import net.minecraft.server.level.ServerLevel;
import net.minecraft.world.level.block.Block;
import net.minecraft.world.level.block.entity.BlockEntity;
import net.minecraft.world.level.block.state.BlockState;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;

/** Stellt den Zustand vor einem Bau wieder her und löscht danach dessen Undo-Datei. */
public final class UndoJob extends Job {
    private final ServerLevel level;
    private final UndoStore.Record record;
    private final Path file;
    private final BlockPos.MutableBlockPos p = new BlockPos.MutableBlockPos();
    private int cursor;
    private int shapeCursor;

    private UndoJob(String id, ServerLevel level, UndoStore.Record record, Path file) {
        super(id);
        this.level = level;
        this.record = record;
        this.file = file;
        total = record.size();
    }

    /** Rückgängig für den neuesten gespeicherten Bau, oder {@code null}, wenn es keinen gibt. */
    public static UndoJob latest(MinecraftServer server, String id) throws IOException {
        Path file = UndoStore.latest(server);
        if (file == null) return null;
        UndoStore.Record r = UndoStore.load(file);
        ServerLevel level = server.getLevel(ResourceKey.create(Registries.DIMENSION, ResourceLocation.parse(r.dimension)));
        if (level == null) throw new IOException("Dimension " + r.dimension + " gibt es nicht mehr");
        return new UndoJob(id, level, r, file);
    }

    @Override
    protected boolean work(long deadline) {
        // rückwärts, damit bei doppelt veränderten Positionen der älteste Zustand gewinnt
        while (cursor < record.size()) {
            if (System.nanoTime() > deadline) return false;
            int i = record.size() - 1 - cursor++;
            done = cursor;
            p.set(BlockPos.of(record.pos(i)));
            level.getChunk(p.getX() >> 4, p.getZ() >> 4);
            BlockState old = record.state(i);
            BuildJob.set(level, p, level.getBlockState(p), old, null);
            CompoundTag be = record.blockEntity(i);
            if (be != null) {
                BlockEntity loaded = BlockEntity.loadStatic(p.immutable(), old, be, level.registryAccess());
                if (loaded != null) level.setBlockEntity(loaded);
            }
        }
        state = State.SHAPING;
        while (shapeCursor < record.size()) {
            if (System.nanoTime() > deadline) return false;
            p.set(BlockPos.of(record.pos(shapeCursor++)));
            BlockState s = level.getBlockState(p);
            BlockState shaped = Block.updateFromNeighbourShapes(s, level, p);
            if (shaped != s) level.setBlock(p, shaped, UndoStore.QUIET);
        }
        return true;
    }

    @Override
    protected void onFinish() {
        if (state != State.DONE) return; // abgebrochen: Datei behalten, damit man es erneut versuchen kann
        try {
            Files.deleteIfExists(file);
        } catch (IOException e) {
            MCPainter.LOGGER.warn("MCPainter: Undo-Datei {} nicht gelöscht", file, e);
        }
    }

    @Override
    protected String kind() {
        return "undo";
    }
}
