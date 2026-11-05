package io.github.desssno.mcpainter.build;

import net.minecraft.nbt.ByteArrayTag;
import net.minecraft.nbt.CompoundTag;
import net.minecraft.nbt.IntArrayTag;
import net.minecraft.nbt.NbtIo;
import org.junit.jupiter.api.Test;

import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;

import static org.junit.jupiter.api.Assertions.assertArrayEquals;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

/** Liest Pläne so, wie der Basenplaner sie an die Brücke schickt, und prüft die Bau-Reihenfolge. */
class SpongeSchematicTest {
    private static SpongeSchematic fixture() throws IOException {
        // erzeugt von tools/gen-mod-fixture.mjs mit dem Exporter der Web-App
        try (InputStream in = SpongeSchematicTest.class.getResourceAsStream("/basenplaner-export.schem")) {
            return SpongeSchematic.read(in.readAllBytes());
        }
    }

    private static String at(SpongeSchematic s, int x, int y, int z) {
        return s.palette()[s.data()[s.index(x, y, z)]];
    }

    @Test
    void readsWebAppExport() throws IOException {
        SpongeSchematic s = fixture();
        assertEquals(20, s.width());
        assertEquals(3, s.height());
        assertEquals(8, s.length());
        assertArrayEquals(new int[]{-2, 64, -8}, new int[]{s.offsetX(), s.offsetY(), s.offsetZ()});
        assertEquals(154, s.palette().length);
        assertEquals("minecraft:air", s.palette()[0]);
        assertEquals("minecraft:stone_bricks", at(s, 0, 0, 7));
        assertEquals("minecraft:stone_bricks", at(s, 19, 0, 7));
        assertEquals("minecraft:oak_stairs[facing=east,half=bottom]", at(s, 2, 1, 7));
        assertEquals("minecraft:glass", at(s, 19, 1, 7));
        // Palettenindex > 127: zwei Varint-Bytes
        assertEquals("minecraft:test_block_149", at(s, 9, 2, 0));
        assertEquals("minecraft:air", at(s, 0, 1, 0));
    }

    @Test
    void buildOrderGroupsChunksAndGoesBottomUp() throws IOException {
        SpongeSchematic s = fixture();
        int[] order = BuildOrder.of(s, i -> s.data()[i] != 0);
        assertEquals(20 + 2 + 150, order.length);
        int lastChunk = Integer.MIN_VALUE, lastY = -1;
        for (int i : order) {
            int x = i % s.width(), y = i / (s.width() * s.length());
            int chunkX = (s.offsetX() + x) >> 4;
            assertTrue(chunkX >= lastChunk, "Chunks nacheinander, nicht durcheinander");
            if (chunkX != lastChunk) lastY = -1;
            assertTrue(y >= lastY, "im Chunk von unten nach oben");
            lastChunk = chunkX;
            lastY = y;
        }
        // x = -2..-1 liegt in Chunk -1 und kommt zuerst
        assertEquals(-1, (s.offsetX() + order[0] % s.width()) >> 4);
        assertEquals(1, (s.offsetX() + order[order.length - 1] % s.width()) >> 4);
    }

    @Test
    void readsSpongeVersion3() throws IOException {
        CompoundTag palette = new CompoundTag();
        palette.putInt("minecraft:stone", 0);
        palette.putInt("minecraft:air", 1);
        CompoundTag blocks = new CompoundTag();
        blocks.put("Palette", palette);
        blocks.put("Data", new ByteArrayTag(new byte[]{0, 1}));
        CompoundTag schem = new CompoundTag();
        schem.putInt("Version", 3);
        schem.putShort("Width", (short) 2);
        schem.putShort("Height", (short) 1);
        schem.putShort("Length", (short) 1);
        schem.put("Offset", new IntArrayTag(new int[]{5, -60, 7}));
        schem.put("Blocks", blocks);
        CompoundTag root = new CompoundTag();
        root.put("Schematic", schem);
        ByteArrayOutputStream out = new ByteArrayOutputStream();
        NbtIo.writeCompressed(root, out);

        SpongeSchematic s = SpongeSchematic.read(out.toByteArray());
        assertEquals("minecraft:stone", at(s, 0, 0, 0));
        assertEquals("minecraft:air", at(s, 1, 0, 0));
        assertEquals(-60, s.offsetY());
    }

    @Test
    void rejectsGarbage() {
        assertThrows(IOException.class, () -> SpongeSchematic.read(new byte[]{1, 2, 3, 4}));
    }

    @Test
    void rejectsTruncatedBlockData() throws IOException {
        CompoundTag palette = new CompoundTag();
        palette.putInt("minecraft:stone", 0);
        CompoundTag schem = new CompoundTag();
        schem.putInt("Version", 2);
        schem.putShort("Width", (short) 4);
        schem.putShort("Height", (short) 1);
        schem.putShort("Length", (short) 1);
        schem.put("Palette", palette);
        schem.put("BlockData", new ByteArrayTag(new byte[]{0, 0}));
        ByteArrayOutputStream out = new ByteArrayOutputStream();
        NbtIo.writeCompressed(schem, out);
        assertThrows(IOException.class, () -> SpongeSchematic.read(out.toByteArray()));
    }
}
