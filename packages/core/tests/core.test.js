import { describe, expect, it } from "vitest";
import { computeMomentumScore, getContentType, getScoreBand, parseDurationToSeconds, similarityScore } from "../src/index.js";
describe("core scoring", () => {
    it("parses durations and content types", () => {
        expect(parseDurationToSeconds("PT2M45S")).toBe(165);
        expect(getContentType(165)).toBe("short");
        expect(getContentType(400)).toBe("long");
    });
    it("assigns score bands and momentum", () => {
        expect(getScoreBand(4)).toBe("warm");
        expect(getScoreBand(7)).toBe("hot");
        expect(getScoreBand(14)).toBe("fire");
        expect(computeMomentumScore(6, 1200, 100000, 3000)).toBeGreaterThan(6);
    });
    it("measures title similarity", () => {
        expect(similarityScore("How I made money with AI", "How creators make money using AI")).toBeGreaterThan(0.2);
    });
});
