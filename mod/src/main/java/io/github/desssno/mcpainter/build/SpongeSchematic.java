package io.github.desssno.mcpainter.build;

import net.minecraft.nbt.CompoundTag;
import net.minecraft.nbt.NbtAccounter;
import net.minecraft.nbt.NbtIo;
import net.minecraft.nbt.Tag;

import java.io.ByteArrayInputStream;
import java.io.IOException;

/**
 * Sponge-Schematic (.schem, Version 2 und 3) lesen. Der Basenplaner schickt seine Pläne in diesem Format
 * an die Brücke (Konzept Abschnitt 4); {@code Offset} sind die echten Weltkoordinaten der unteren Ecke.
 *
 * @param data Palettenindex je Block, Reihenfolge x schnell, dann z, dann y: {@code (y * length + z) * width + x}
 */
public record SpongeSchematic(int width, int height, int length, int offsetX, int offsetY, int offsetZ,
                              String[] palette, int[] data) {

    /** Größte erlaubte Anzahl Blöcke (Breite × Höhe × Länge). */
    public static final long MAX_VOLUME = 150_000_000L;

    public static SpongeSchematic read(byte[] gzipped) throws IOException {
        CompoundTag root = NbtIo.readCompressed(new ByteArrayInputStream(gzipped), NbtAccounter.create(512L * 1024 * 1024));
        // Version 3 steckt alles in "Schematic", Version 2 liegt direkt in der Wurzel
        if (root.contains("Schematic", Tag.TAG_COMPOUND)) root = root.getCompound("Schematic");
        int version = root.getInt("Version");
        int w = Short.toUnsignedInt(root.getShort("Width"));
        int h = Short.toUnsignedInt(root.getShort("Height"));
        int l = Short.toUnsignedInt(root.getShort("Length"));
        if (w == 0 || h == 0 || l == 0) throw new IOException("Keine gültige Schematic (Größe 0)");
        long volume = (long) w * h * l;
        if (volume > MAX_VOLUME) throw new IOException("Schematic zu groß: " + w + "×" + h + "×" + l);

        int[] offset = root.getIntArray("Offset");
        int ox = offset.length == 3 ? offset[0] : 0, oy = offset.length == 3 ? offset[1] : 0, oz = offset.length == 3 ? offset[2] : 0;

        CompoundTag blocks = version >= 3 ? root.getCompound("Blocks") : root;
        CompoundTag pal = blocks.getCompound("Palette");
        byte[] raw = version >= 3 ? blocks.getByteArray("Data") : root.getByteArray("BlockData");

        int max = 0;
        for (String key : pal.getAllKeys()) max = Math.max(max, pal.getInt(key));
        String[] palette = new String[max + 1];
        for (String key : pal.getAllKeys()) palette[pal.getInt(key)] = key;

        int[] data = new int[(int) volume];
        int pos = 0;
        for (int i = 0; i < data.length; i++) {
            // Varint: 7 Bit pro Byte, oberstes Bit = es folgt noch ein Byte
            int value = 0, shift = 0;
            while (true) {
                if (pos >= raw.length) throw new IOException("Blockdaten zu kurz (" + i + " von " + data.length + ")");
                byte b = raw[pos++];
                value |= (b & 0x7f) << shift;
                if ((b & 0x80) == 0) break;
                shift += 7;
                if (shift > 28) throw new IOException("Ungültiger Varint in den Blockdaten");
            }
            if (value >= palette.length || palette[value] == null) throw new IOException("Palettenindex " + value + " fehlt");
            data[i] = value;
        }
        return new SpongeSchematic(w, h, l, ox, oy, oz, palette, data);
    }

    public int index(int x, int y, int z) {
        return (y * length + z) * width + x;
    }
}
