package io.github.desssno.mcpainter.client;

import com.cinemamod.mcef.MCEF;
import com.cinemamod.mcef.MCEFBrowser;
import org.cef.event.CefMouseEvent;
import org.lwjgl.glfw.GLFW;

/**
 * MCEF-Browser, der bei Mausereignissen auch Shift, Strg und Alt mitschickt.
 * MCEF selbst übergibt dort nur die Maustasten; der Editor braucht aber z. B. Shift beim Ziehen
 * (Quadrat/Kreis, gerade Linie) und Shift/Alt beim Zauberstab.
 */
final class EditorBrowser extends MCEFBrowser {
    /** Gedrückte Maustasten als CEF-Flags (links 16, Mitte 32, rechts 64). */
    private int buttons;

    private EditorBrowser(String url) {
        super(MCEF.getClient(), url, false);
    }

    /** Wie {@link MCEF#createBrowser(String, boolean)}, nur mit dieser Klasse. */
    static EditorBrowser create(String url) {
        EditorBrowser b = new EditorBrowser(url);
        b.setCloseAllowed();
        b.createImmediately();
        return b;
    }

    /**
     * MCEFs java-cef erwartet die Modifier im GLFW-Format (Shift 1, Strg 2, Alt 4), nicht als CEF-EventFlags
     * (dort wäre 2 = Shift; im Test kam das als Strg an). Also nur die drei Tasten durchreichen.
     */
    static int cefModifiers(int glfwMods) {
        return glfwMods & (GLFW.GLFW_MOD_SHIFT | GLFW.GLFW_MOD_CONTROL | GLFW.GLFW_MOD_ALT);
    }

    /** Minecraft: 0 links, 1 rechts, 2 Mitte. CEF: 0 links, 1 Mitte, 2 rechts. */
    private static int cefButton(int mcButton) {
        return mcButton == 1 ? 2 : mcButton == 2 ? 1 : mcButton;
    }

    private static int mask(int cefButton) {
        return switch (cefButton) {
            case 0 -> CefMouseEvent.BUTTON1_MASK;
            case 1 -> CefMouseEvent.BUTTON2_MASK;
            case 2 -> CefMouseEvent.BUTTON3_MASK;
            default -> 0;
        };
    }

    void mouseMove(int x, int y, int glfwMods) {
        sendMouseEvent(new CefMouseEvent(CefMouseEvent.MOUSE_MOVED, x, y, 0, 0, buttons | cefModifiers(glfwMods)));
    }

    void mousePress(int x, int y, int mcButton, int glfwMods) {
        int b = cefButton(mcButton);
        buttons |= mask(b);
        // MCEFs java-cef nimmt GLFW_PRESS/GLFW_RELEASE als Ereignis-ID
        sendMouseEvent(new CefMouseEvent(GLFW.GLFW_PRESS, x, y, 1, b, buttons | cefModifiers(glfwMods)));
    }

    void mouseRelease(int x, int y, int mcButton, int glfwMods) {
        int b = cefButton(mcButton);
        buttons &= ~mask(b);
        sendMouseEvent(new CefMouseEvent(GLFW.GLFW_RELEASE, x, y, 1, b, buttons | cefModifiers(glfwMods)));
    }
}
