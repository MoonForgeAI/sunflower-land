import { MoonForgeAnalytics, MoonForgeErrorTracker } from "lib/moonforge";
import {
  mfAccountCreated,
  mfEconomy,
  mfExperiment,
  mfIapCompleted,
  mfIapInitiated,
  mfIdentify,
  mfScreen,
  mfSetScene,
  mfTrack,
  mfTutorialComplete,
  mfTutorialStart,
} from "./moonforgeAnalytics";

const TEST_GAME_ID = "00000000-0000-4000-8000-000000000000";

describe("moonforgeAnalytics", () => {
  let fetchMock: jest.Mock;

  beforeEach(() => {
    fetchMock = jest.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => ({ cache: "token" }),
    }));
    (globalThis as { fetch?: unknown }).fetch = fetchMock;
    jest.spyOn(console, "warn").mockImplementation(() => undefined);
    jest.spyOn(console, "log").mockImplementation(() => undefined);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe("before the SDK is initialised", () => {
    it("no-ops without throwing and sends nothing", () => {
      expect(() => {
        mfTrack("crop_harvested", { crop_type: "Sunflower" });
        mfScreen("PlazaScene");
        mfIdentify("account1");
        mfSetScene("PlazaScene");
      }).not.toThrow();

      expect(fetchMock).not.toHaveBeenCalled();
    });
  });

  describe("after the SDK is initialised", () => {
    // Events are buffered until the player is identified, so that
    // session_start and other boot-time events can be attributed to the
    // account rather than an anonymous id. These cases assert the envelope
    // and delivery, so they start from the identified state.
    beforeEach(() => {
      MoonForgeAnalytics.markIdentified();
    });

    beforeAll(() => {
      MoonForgeAnalytics.init({
        gameId: TEST_GAME_ID,
        autoTrackSession: false,
      });
    });

    it("mfTrack posts the event envelope to the collector", () => {
      mfTrack("crop_harvested", { crop_type: "Sunflower", amount: 1 });

      expect(fetchMock).toHaveBeenCalledTimes(1);
      const [url, init] = fetchMock.mock.calls[0];
      expect(String(url)).toBe("https://collector.moonforge.co/api/send");

      const body = JSON.parse((init as { body: string }).body);
      expect(body.type).toBe("event");
      expect(body.payload.game).toBe(TEST_GAME_ID);
      expect(body.payload.name).toBe("crop_harvested");
      expect(body.payload.data).toMatchObject({
        crop_type: "Sunflower",
        amount: 1,
      });
    });

    it("sends unix-second timestamps (collector rejects milliseconds)", () => {
      mfTrack("crop_harvested", { crop_type: "Sunflower" });

      const body = JSON.parse(
        (fetchMock.mock.calls[0][1] as { body: string }).body,
      );
      expect(body.payload.timestamp).toBeGreaterThan(1e9);
      expect(body.payload.timestamp).toBeLessThan(1e11);
    });

    it("mfScreen posts a screen_view with the scene name", () => {
      mfScreen("BeachScene");

      const body = JSON.parse(
        (fetchMock.mock.calls[0][1] as { body: string }).body,
      );
      expect(body.payload.name).toBe("screen_view");
      expect(body.payload.data.screen_name).toBe("BeachScene");
    });

    it("mfSetScene tags the error tracker's game state", () => {
      mfSetScene("KingdomScene");

      expect(MoonForgeErrorTracker.getGameState()).toMatchObject({
        sceneName: "KingdomScene",
      });
    });

    it("never throws into game code even if the SDK throws", () => {
      const spy = jest
        .spyOn(MoonForgeAnalytics, "trackEvent")
        .mockImplementation(() => {
          throw new Error("boom");
        });

      expect(() => mfTrack("crop_harvested")).not.toThrow();

      spy.mockRestore();
    });

    it("identifies with a farm-scoped id so sessions join across visits", () => {
      const spy = jest.spyOn(MoonForgeAnalytics, "identify");

      mfIdentify("account123", { farmId: 456 });

      expect(spy).toHaveBeenCalledWith("account123", {
        farmId: 456,
      });

      spy.mockRestore();
    });

    it("sends with keepalive so a backgrounded mobile tab still delivers", () => {
      mfTrack("session_start");

      const init = fetchMock.mock.calls[0][1];
      expect(init.keepalive).toBe(true);
    });

    it("records experiment assignment so a holdout can be analysed later", () => {
      mfExperiment("purchase_prompt_holdout", "control");

      const body = JSON.parse(
        (fetchMock.mock.calls[0][1] as { body: string }).body,
      );
      expect(body.payload.name).toBe("experiment_assigned");
      expect(body.payload.data).toMatchObject({
        experiment_id: "purchase_prompt_holdout",
        variant: "control",
      });
    });

    // trackEvent returns postEvent's promise, so a collector failure rejects
    // rather than throwing. A try/catch alone leaves that unhandled in the
    // player's browser.
    it("mfExperiment handles a rejected trackEvent without an unhandled rejection", async () => {
      const spy = jest
        .spyOn(MoonForgeAnalytics, "trackEvent")
        .mockReturnValue(Promise.reject(new Error("collector down")) as never);

      const unhandled: unknown[] = [];
      const onUnhandled = (e: unknown) => unhandled.push(e);
      process.on("unhandledRejection", onUnhandled);

      expect(() => mfExperiment("exp", "control")).not.toThrow();

      await new Promise((r) => setTimeout(r, 10));
      process.off("unhandledRejection", onUnhandled);

      expect(unhandled).toHaveLength(0);
      spy.mockRestore();
    });

    it("mfExperiment never throws into game code even if the SDK throws", () => {
      const spy = jest
        .spyOn(MoonForgeAnalytics, "trackEvent")
        .mockImplementation(() => {
          throw new Error("boom");
        });

      expect(() =>
        mfExperiment("purchase_prompt_holdout", "control"),
      ).not.toThrow();

      spy.mockRestore();
    });

    const eventOf = () =>
      JSON.parse((fetchMock.mock.calls[0][1] as { body: string }).body).payload;

    describe("mfEconomy", () => {
      it("posts economy_transaction with flattened input and output rows", () => {
        mfEconomy("speed_up_building", {
          inputs: [{ type: "Gem", before: 10, after: 7 }],
          outputs: [{ type: "Basic Building", before: 0, after: 1 }],
        });

        const { name, data } = eventOf();
        expect(name).toBe("economy_transaction");
        expect(data).toMatchObject({
          reason: "speed_up_building",
          input_1_type: "Gem",
          input_1_before: 10,
          input_1_after: 7,
          output_1_type: "Basic Building",
          output_1_before: 0,
          output_1_after: 1,
        });
      });

      it("omits before / after for the ends that are not known", () => {
        mfEconomy("daily_reward", { outputs: [{ type: "Coin", after: 250 }] });

        const { data } = eventOf();
        expect(data).toMatchObject({
          reason: "daily_reward",
          output_1_type: "Coin",
          output_1_after: 250,
        });
        expect(data).not.toHaveProperty("output_1_before");
        expect(data).not.toHaveProperty("input_1_type");
      });

      it("keeps the first 3 rows and warns about the rest", () => {
        const warnSpy = jest.spyOn(console, "warn");

        mfEconomy("cook_food", {
          inputs: [
            { type: "Sunflower", before: 4, after: 3 },
            { type: "Potato", before: 4, after: 3 },
            { type: "Pumpkin", before: 4, after: 3 },
            { type: "Carrot", before: 4, after: 3 },
          ],
        });

        const { data } = eventOf();
        expect(data.input_3_type).toBe("Pumpkin");
        expect(data).not.toHaveProperty("input_4_type");
        expect(warnSpy).toHaveBeenCalled();
      });
    });

    it("mfIapInitiated posts iap_initiated with the required keys", () => {
      mfIapInitiated({ product_id: "gems_500", price: 4.99, currency: "USD" });

      const { name, data } = eventOf();
      expect(name).toBe("iap_initiated");
      expect(data).toMatchObject({
        product_id: "gems_500",
        price: 4.99,
        currency: "USD",
      });
    });

    it("mfIapCompleted includes the transaction_id so a double callback de-dupes", () => {
      mfIapCompleted({
        product_id: "gems_500",
        price: 4.99,
        currency: "USD",
        transaction_id: "txn_abc",
        store: "web",
      });

      const { name, data } = eventOf();
      expect(name).toBe("iap_completed");
      expect(data).toMatchObject({
        product_id: "gems_500",
        transaction_id: "txn_abc",
        store: "web",
      });
    });

    it("mfTutorialStart / mfTutorialComplete send the locked names", () => {
      mfTutorialStart();
      expect(eventOf().name).toBe("tutorial_start");

      fetchMock.mockClear();
      mfTutorialComplete("completed");
      expect(eventOf()).toMatchObject({
        name: "tutorial_complete",
        data: { outcome: "completed" },
      });
    });

    it("mfAccountCreated sends signup_method and optional provider", () => {
      mfAccountCreated({ signup_method: "social", provider: "google" });

      const { name, data } = eventOf();
      expect(name).toBe("account_created");
      expect(data).toMatchObject({
        signup_method: "social",
        provider: "google",
      });
    });

    it("the locked helpers swallow a rejected trackEvent without an unhandled rejection", async () => {
      const spy = jest
        .spyOn(MoonForgeAnalytics, "trackEvent")
        .mockReturnValue(Promise.reject(new Error("collector down")) as never);

      const unhandled: unknown[] = [];
      const onUnhandled = (e: unknown) => unhandled.push(e);
      process.on("unhandledRejection", onUnhandled);

      expect(() => {
        mfEconomy("daily_reward", { outputs: [{ type: "Coin", after: 1 }] });
        mfIapCompleted({
          product_id: "p",
          price: 1,
          currency: "USD",
          transaction_id: "t",
        });
        mfAccountCreated({ signup_method: "other" });
      }).not.toThrow();

      await new Promise((r) => setTimeout(r, 10));
      process.off("unhandledRejection", onUnhandled);

      expect(unhandled).toHaveLength(0);
      spy.mockRestore();
    });
  });
});
