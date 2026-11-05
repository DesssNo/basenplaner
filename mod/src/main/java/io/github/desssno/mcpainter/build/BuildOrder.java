package io.github.desssno.mcpainter.build;

import java.util.Arrays;
import java.util.Map;
import java.util.TreeMap;
import java.util.function.IntPredicate;

/**
 * Bau-Reihenfolge (Konzept Abschnitt 7): nach Chunks sortiert, innerhalb eines Chunks von unten nach oben.
 * Chunks werden zeilenweise abgearbeitet (erst x, dann z), damit selten mehr als eine Chunkreihe geladen sein muss.
 */
public final class BuildOrder {
    private BuildOrder() {
    }

    /**
     * @param include welche Volumen-Indizes gebaut werden (z. B. ohne Luft)
     * @return Volumen-Indizes in Bau-Reihenfolge
     */
    public static int[] of(SpongeSchematic s, IntPredicate include) {
        // Schlüssel: Chunk z, dann Chunk x. Die Daten liegen y-weise vor, daher ist jede Liste schon von unten nach oben sortiert.
        Map<Long, IntList> chunks = new TreeMap<>();
        for (int y = 0; y < s.height(); y++) {
            for (int z = 0; z < s.length(); z++) {
                int cz = (s.offsetZ() + z) >> 4;
                for (int x = 0; x < s.width(); x++) {
                    int i = s.index(x, y, z);
                    if (!include.test(i)) continue;
                    int cx = (s.offsetX() + x) >> 4;
                    long key = ((long) cz << 32) + ((long) cx - Integer.MIN_VALUE);
                    chunks.computeIfAbsent(key, k -> new IntList()).add(i);
                }
            }
        }
        int total = 0;
        for (IntList l : chunks.values()) total += l.size;
        int[] out = new int[total];
        int p = 0;
        for (IntList l : chunks.values()) {
            System.arraycopy(l.items, 0, out, p, l.size);
            p += l.size;
        }
        return out;
    }

    private static final class IntList {
        int[] items = new int[64];
        int size;

        void add(int v) {
            if (size == items.length) items = Arrays.copyOf(items, size * 2);
            items[size++] = v;
        }
    }
}
