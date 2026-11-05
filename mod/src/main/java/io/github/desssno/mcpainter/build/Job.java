package io.github.desssno.mcpainter.build;

import com.google.gson.JsonArray;
import com.google.gson.JsonObject;

import java.util.ArrayList;
import java.util.List;

/** Ein Bau- oder Rückgängig-Auftrag, der in kleinen Portionen pro Server-Tick abgearbeitet wird. */
public abstract class Job {
    public enum State { QUEUED, RUNNING, SHAPING, DONE, CANCELLED, FAILED }

    public final String id;
    protected State state = State.QUEUED;
    protected int done;
    protected int total;
    protected String error;
    protected final List<String> unknownBlocks = new ArrayList<>();
    private boolean cancelRequested;

    protected Job(String id) {
        this.id = id;
    }

    /** Arbeitet bis zur Frist (System.nanoTime) und gibt {@code true} zurück, wenn der Auftrag beendet ist. */
    public final boolean tick(long deadline) {
        if (cancelRequested && !isFinished()) {
            finish(State.CANCELLED);
            return true;
        }
        if (state == State.QUEUED) state = State.RUNNING;
        try {
            if (work(deadline)) {
                finish(State.DONE);
                return true;
            }
            return false;
        } catch (RuntimeException e) {
            error = e.toString();
            finish(State.FAILED);
            throw e;
        }
    }

    /** @return {@code true}, wenn alles erledigt ist */
    protected abstract boolean work(long deadline);

    /** Wird genau einmal am Ende aufgerufen (auch bei Abbruch), z. B. um die Undo-Daten zu speichern. */
    protected void onFinish() {
    }

    private void finish(State end) {
        if (isFinished()) return;
        state = end;
        onFinish();
    }

    public void cancel() {
        cancelRequested = true;
    }

    /** Sofort beenden, z. B. wenn die Welt geschlossen wird. */
    public void stopNow() {
        if (!isFinished()) finish(State.CANCELLED);
    }

    public boolean isFinished() {
        return state == State.DONE || state == State.CANCELLED || state == State.FAILED;
    }

    public State state() {
        return state;
    }

    public JsonObject toJson() {
        JsonObject o = new JsonObject();
        o.addProperty("id", id);
        o.addProperty("kind", kind());
        o.addProperty("state", state.name().toLowerCase());
        o.addProperty("done", done);
        o.addProperty("total", total);
        JsonArray unknown = new JsonArray();
        unknownBlocks.forEach(unknown::add);
        o.add("unknownBlocks", unknown);
        if (error != null) o.addProperty("error", error);
        return o;
    }

    protected abstract String kind();
}
