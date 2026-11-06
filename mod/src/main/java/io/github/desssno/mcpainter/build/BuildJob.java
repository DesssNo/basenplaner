package io.github.desssno.mcpainter.build;

import com.google.gson.JsonObject;
import com.mojang.brigadier.exceptions.CommandSyntaxException;
import net.minecraft.commands.arguments.blocks.BlockStateParser;
import net.minecraft.core.BlockPos;
import net.minecraft.core.registries.BuiltInRegistries;
import net.minecraft.nbt.CompoundTag;
import net.minecraft.server.level.ServerLevel;
import net.minecraft.world.Clearable;
import net.minecraft.world.level.block.Block;
import net.minecraft.world.level.block.Blocks;
import net.minecraft.world.level.block.LiquidBlock;
import net.minecraft.world.level.block.entity.BlockEntity;
import net.minecraft.world.level.block.state.BlockState;

/**
 * Baut eine Sponge-Schematic an ihren Weltkoordinaten (Konzept Abschnitt 7):
 * <ol>
 *   <li>Palette mit {@link BlockStateParser} einlesen, unbekannte Blöcke melden und überspringen</li>
 *   <li>nach Chunks sortiert, im Chunk von unten nach oben ({@link BuildOrder})</li>
 *   <li>ohne Physik setzen, alten Zustand inkl. Block-Entity fürs Undo sichern</li>
 *   <li>am Ende ein Durchgang, der die Formen anpasst (Zäune, Scheiben, Treppen verbinden sich)</li>
 * </ol>
 */
public final class BuildJob extends Job {
    public enum Overwrite {
        /** nur in Luft bauen */
        NONE,
        /** Luft und Flüssigkeiten ersetzen */
        AIR_FLUIDS,
        /** alles überschreiben */
        ALL
    }

    /** Palettenname für „hier abreißen“ (siehe Editor, Bau nur der Änderungen). */
    public static final String REMOVE = "mcpainter:remove";

    private final ServerLevel level;
    private final SpongeSchematic schem;
    private final BlockState[] states;
    private final int[] order;
    private final Overwrite overwrite;
    private final UndoStore.Record undo;
    private final BlockPos.MutableBlockPos cursorPos = new BlockPos.MutableBlockPos();
    private int cursor;
    private int shapeCursor;
    private int placed;
    private int skipped;

    public BuildJob(String id, ServerLevel level, SpongeSchematic schem, Overwrite overwrite, boolean clearAir) {
        super(id);
        this.level = level;
        this.schem = schem;
        this.overwrite = overwrite;
        this.undo = new UndoStore.Record(level.dimension().location().toString());
        states = new BlockState[schem.palette().length];
        boolean[] remove = new boolean[states.length];
        for (int i = 0; i < states.length; i++) {
            String name = schem.palette()[i];
            if (name == null) continue;
            // Der Editor markiert so Blöcke, die gebaut waren und im Plan gelöscht wurden: dort Luft setzen
            if (name.equals(REMOVE)) {
                states[i] = Blocks.AIR.defaultBlockState();
                remove[i] = true;
                continue;
            }
            try {
                states[i] = BlockStateParser.parseForBlock(BuiltInRegistries.BLOCK.asLookup(), name, false).blockState();
            } catch (CommandSyntaxException e) {
                unknownBlocks.add(name);
            }
        }
        int[] data = schem.data();
        order = BuildOrder.of(schem, i -> {
            BlockState s = states[data[i]];
            return s != null && (clearAir || remove[data[i]] || !s.isAir());
        });
        total = order.length;
        skipped = 0;
        for (int v : data) if (states[v] == null) skipped++;
    }

    @Override
    protected boolean work(long deadline) {
        int[] data = schem.data();
        int w = schem.width(), l = schem.length();
        while (cursor < order.length) {
            if (System.nanoTime() > deadline) return false;
            int i = order[cursor++];
            done = cursor;
            int x = i % w, z = (i / w) % l, y = i / (w * l);
            cursorPos.set(schem.offsetX() + x, schem.offsetY() + y, schem.offsetZ() + z);
            if (level.isOutsideBuildHeight(cursorPos)) {
                skipped++;
                continue;
            }
            // lädt bzw. generiert den Chunk, falls nötig; die Zeit dafür zählt zum Budget
            level.getChunk(cursorPos.getX() >> 4, cursorPos.getZ() >> 4);
            BlockState target = states[data[i]];
            BlockState old = level.getBlockState(cursorPos);
            if (old == target) continue;
            if (!replaceable(old)) {
                skipped++;
                continue;
            }
            set(level, cursorPos, old, target, undo);
            placed++;
        }
        // Formen anpassen, damit sich Zäune, Scheiben, Mauern und Treppen verbinden
        state = State.SHAPING;
        while (shapeCursor < undo.size()) {
            if (System.nanoTime() > deadline) return false;
            cursorPos.set(BlockPos.of(undo.pos(shapeCursor++)));
            BlockState s = level.getBlockState(cursorPos);
            BlockState shaped = Block.updateFromNeighbourShapes(s, level, cursorPos);
            if (shaped != s) level.setBlock(cursorPos, shaped, UndoStore.QUIET);
        }
        return true;
    }

    private boolean replaceable(BlockState old) {
        return switch (overwrite) {
            case NONE -> old.isAir();
            case AIR_FLUIDS -> old.isAir() || old.getBlock() instanceof LiquidBlock;
            case ALL -> true;
        };
    }

    /** Setzt einen Block ohne Physik und merkt sich den alten Zustand (mit Truheninhalt usw.). */
    static void set(ServerLevel level, BlockPos pos, BlockState old, BlockState target, UndoStore.Record undo) {
        CompoundTag beData = null;
        BlockEntity be = level.getBlockEntity(pos);
        if (be != null) {
            beData = be.saveWithFullMetadata(level.registryAccess());
            // Inhalt leeren, damit beim Ersetzen nichts herausfällt (wie bei /setblock)
            Clearable.tryClear(be);
        }
        if (undo != null) undo.add(pos.immutable(), old, beData);
        level.setBlock(pos, target, UndoStore.QUIET);
    }

    @Override
    protected void onFinish() {
        UndoStore.save(level.getServer(), id, undo);
    }

    @Override
    public JsonObject toJson() {
        JsonObject o = super.toJson();
        o.addProperty("placed", placed);
        o.addProperty("skipped", skipped);
        o.addProperty("dimension", level.dimension().location().toString());
        return o;
    }

    @Override
    protected String kind() {
        return "build";
    }
}
