"""Deterministic Sparkov-*shaped* transaction generator.

This exists because the judged repo has to run on a machine with no Kaggle credentials.
``scripts/fetch_data.py`` tries the real dataset first and only falls back here.

**This is not Sparkov.** It reproduces Sparkov's *columns* and rough marginals so that
``data/features.py`` and the attack engine exercise exactly the same code paths, but the
joint distribution is invented. Every consumer learns which one it got from
``artifacts/data_provenance.json`` (``source: "kaggle" | "synthetic"``), and no number
derived from this generator may be presented as a result on the real dataset.

What is faithful:
    * column names, dtypes and value formats (``fraud_``-prefixed merchants, 16-digit
      ``cc_num``, ``unix_time``, per-cardholder demographics, merchant terminal geography)
    * the ~0.5% fraud base rate and its extreme class imbalance
    * fraud arriving in short bursts on a compromised card rather than as isolated rows
    * heavy-tailed, category-dependent amounts

What is invented (and therefore what results computed on it cannot claim):
    * the actual fraud mechanism. Here fraud is a mixture of amount inflation, night-hour
      concentration, card-testing micro-amounts, category shift toward card-not-present,
      and wider cardholder-to-terminal distance. Real Sparkov's generator is different, so
      feature importances and PR-AUC from this data describe *this* generator, not Sparkov.
"""

from __future__ import annotations

import numpy as np
import pandas as pd

# Sparkov's 14 merchant categories, verbatim.
CATEGORIES: tuple[str, ...] = (
    "entertainment",
    "food_dining",
    "gas_transport",
    "grocery_net",
    "grocery_pos",
    "health_fitness",
    "home",
    "kids_pets",
    "misc_net",
    "misc_pos",
    "personal_care",
    "shopping_net",
    "shopping_pos",
    "travel",
)

# Mean log-amount per category -- gas is small and frequent, travel is large and rare.
_CATEGORY_MU: dict[str, float] = {
    "entertainment": 3.6,
    "food_dining": 3.5,
    "gas_transport": 3.3,
    "grocery_net": 3.2,
    "grocery_pos": 4.1,
    "health_fitness": 3.4,
    "home": 3.8,
    "kids_pets": 3.6,
    "misc_net": 3.4,
    "misc_pos": 3.1,
    "personal_care": 3.3,
    "shopping_net": 4.0,
    "shopping_pos": 4.0,
    "travel": 5.2,
}

# Card-not-present-ish categories fraud rings prefer.
_FRAUD_CATEGORY_WEIGHTS = np.array(
    [1.0, 0.6, 0.5, 1.4, 2.2, 0.5, 1.0, 0.8, 2.4, 1.6, 0.6, 3.2, 2.6, 0.9]
)

# (state, approximate centroid lat, long). Enough spread that distance_km is meaningful.
_STATES: tuple[tuple[str, float, float], ...] = (
    ("AL", 32.8, -86.8), ("AR", 34.9, -92.4), ("AZ", 34.2, -111.6), ("CA", 37.2, -119.5),
    ("CO", 39.0, -105.5), ("CT", 41.6, -72.7), ("DE", 39.0, -75.5), ("FL", 28.6, -82.4),
    ("GA", 32.6, -83.4), ("IA", 42.0, -93.5), ("ID", 44.4, -114.6), ("IL", 40.0, -89.2),
    ("IN", 39.9, -86.3), ("KS", 38.5, -98.4), ("KY", 37.5, -85.3), ("LA", 31.1, -92.0),
    ("MA", 42.3, -71.8), ("MD", 39.0, -76.8), ("ME", 45.4, -69.2), ("MI", 44.3, -85.4),
    ("MN", 46.3, -94.3), ("MO", 38.4, -92.5), ("MS", 32.7, -89.7), ("MT", 47.0, -109.6),
    ("NC", 35.5, -79.4), ("ND", 47.4, -100.5), ("NE", 41.5, -99.8), ("NH", 43.7, -71.6),
    ("NJ", 40.2, -74.7), ("NM", 34.4, -106.1), ("NV", 39.3, -116.6), ("NY", 42.9, -75.5),
    ("OH", 40.3, -82.8), ("OK", 35.6, -97.5), ("OR", 43.9, -120.6), ("PA", 40.9, -77.8),
    ("RI", 41.7, -71.6), ("SC", 33.9, -80.9), ("SD", 44.4, -100.2), ("TN", 35.8, -86.4),
    ("TX", 31.5, -99.3), ("UT", 39.3, -111.7), ("VA", 37.5, -78.9), ("VT", 44.1, -72.7),
    ("WA", 47.4, -120.4), ("WI", 44.6, -89.7), ("WV", 38.6, -80.6), ("WY", 43.0, -107.5),
)

_JOBS: tuple[str, ...] = (
    "Accountant", "Actuary", "Architect", "Biomedical scientist", "Building surveyor",
    "Cabin crew", "Chemical engineer", "Chiropractor", "Civil engineer", "Clinical cytogeneticist",
    "Copywriter", "Data scientist", "Dentist", "Dietitian", "Ecologist", "Editor",
    "Electrical engineer", "Environmental consultant", "Film editor", "Financial trader",
    "Forensic scientist", "Furniture designer", "Geochemist", "Glass blower", "Health visitor",
    "Herbalist", "Hotel manager", "Illustrator", "Immunologist", "Insurance underwriter",
    "Journalist", "Land surveyor", "Lecturer", "Librarian", "Materials engineer",
    "Media planner", "Museum curator", "Music therapist", "Naval architect", "Nurse",
    "Nutritional therapist", "Oncologist", "Paramedic", "Patent attorney", "Pharmacist",
    "Physiotherapist", "Probation officer", "Product manager", "Psychologist", "Quantity surveyor",
    "Radiographer", "Recruitment consultant", "Research officer", "Retail buyer", "Sales executive",
    "Scientific laboratory technician", "Set designer", "Ship broker", "Social worker",
    "Software engineer", "Sound technician", "Statistician", "Surveyor", "Systems analyst",
    "Teacher", "Television producer", "Tourist information manager", "Town planner",
    "Toxicologist", "Translator", "Travel agency manager", "Veterinary surgeon", "Web designer",
)

_SURNAMES: tuple[str, ...] = (
    "Abbott", "Bauch", "Boyer", "Cormier", "Crooks", "Dach", "Deckow", "Dietrich", "Doyle",
    "Effertz", "Fadel", "Frami", "Gerlach", "Gleason", "Goodwin", "Greenholt", "Gutmann",
    "Hackett", "Hagenes", "Halvorson", "Hane", "Harber", "Heller", "Herzog", "Hettinger",
    "Hilll", "Hodkiewicz", "Homenick", "Huel", "Jast", "Jenkins", "Kassulke", "Kautzer",
    "Kerluke", "Kessler", "Kihn", "Kilback", "Klein", "Koelpin", "Kohler", "Kozey", "Kris",
    "Kuhn", "Kunde", "Kutch", "Labadie", "Lakin", "Langosh", "Lebsack", "Ledner", "Leffler",
    "Lehner", "Lind", "Little", "Lockman", "Lueilwitz", "Maggio", "Marks", "Mayer", "McGlynn",
    "Medhurst", "Mertz", "Mills", "Mitchell", "Moen", "Mohr", "Monahan", "Mueller", "Murphy",
    "Nader", "Nicolas", "Nienow", "Nitzsche", "Olson", "Ondricka", "Orn", "Ortiz", "Osinski",
    "Pacocha", "Padberg", "Parisian", "Pfannerstill", "Pollich", "Powlowski", "Predovic",
    "Price", "Prohaska", "Purdy", "Quigley", "Quitzon", "Ratke", "Rau", "Reichel", "Reilly",
    "Rippin", "Ritchie", "Robel", "Rodriguez", "Rogahn", "Romaguera", "Rowe", "Rutherford",
    "Sanford", "Sauer", "Sawayn", "Schaden", "Schamberger", "Schiller", "Schmidt", "Schoen",
    "Schulist", "Schumm", "Shanahan", "Sipes", "Skiles", "Smitham", "Spencer", "Stamm",
    "Stehr", "Steuber", "Stokes", "Stracke", "Streich", "Swaniawski", "Terry", "Thiel",
    "Tillman", "Torphy", "Towne", "Toy", "Tremblay", "Turcotte", "Ullrich", "Upton",
    "Vandervort", "Veum", "Volkman", "Waelchi", "Walker", "Walsh", "Ward", "Waters",
    "Weimann", "Welch", "White", "Wiegand", "Wilderman", "Wilkinson", "Williamson", "Wisoky",
    "Wolf", "Wuckert", "Wyman", "Yost", "Zboncak", "Ziemann", "Zulauf",
)

_FIRSTNAMES_M: tuple[str, ...] = (
    "Aaron", "Adam", "Brandon", "Brian", "Carl", "Christopher", "Daniel", "David", "Edward",
    "Eric", "Frank", "Gary", "George", "Gregory", "Harold", "Henry", "Jack", "Jason",
    "Jeffrey", "Jeremy", "John", "Jonathan", "Joseph", "Justin", "Keith", "Kevin", "Larry",
    "Mark", "Matthew", "Michael", "Nathan", "Nicholas", "Patrick", "Paul", "Peter", "Philip",
    "Ralph", "Raymond", "Richard", "Robert", "Roger", "Ronald", "Ryan", "Scott", "Sean",
    "Stephen", "Steven", "Terry", "Thomas", "Timothy", "Travis", "Tyler", "Victor", "Wayne",
)

_FIRSTNAMES_F: tuple[str, ...] = (
    "Alice", "Amanda", "Amy", "Andrea", "Angela", "Ann", "Barbara", "Betty", "Brenda",
    "Carol", "Carolyn", "Catherine", "Cheryl", "Christina", "Cynthia", "Deborah", "Debra",
    "Denise", "Diane", "Donna", "Doris", "Dorothy", "Elizabeth", "Emily", "Frances", "Gloria",
    "Heather", "Helen", "Jacqueline", "Janet", "Janice", "Jean", "Jennifer", "Jessica",
    "Joan", "Joyce", "Judith", "Julie", "Karen", "Katherine", "Kathleen", "Kelly", "Kimberly",
    "Laura", "Linda", "Lisa", "Margaret", "Maria", "Marie", "Marilyn", "Martha", "Mary",
    "Melissa", "Michelle", "Nancy", "Nicole", "Pamela", "Patricia", "Rachel", "Rebecca",
    "Ruth", "Sandra", "Sara", "Sharon", "Shirley", "Stephanie", "Susan", "Teresa", "Theresa",
    "Virginia", "Wanda",
)

_STREET_SUFFIX = ("St", "Ave", "Rd", "Ln", "Dr", "Ct", "Way", "Blvd", "Pl", "Ter")
_CITY_PREFIX = ("North", "South", "East", "West", "New", "Fort", "Lake", "Port", "Mount", "Grand")

RAW_COLUMNS: tuple[str, ...] = (
    "trans_date_trans_time",
    "cc_num",
    "merchant",
    "category",
    "amt",
    "first",
    "last",
    "gender",
    "street",
    "city",
    "state",
    "zip",
    "lat",
    "long",
    "city_pop",
    "job",
    "dob",
    "trans_num",
    "unix_time",
    "merch_lat",
    "merch_long",
    "is_fraud",
)

START = pd.Timestamp("2019-01-01")
END = pd.Timestamp("2020-12-31")


def _make_cardholders(rng: np.random.Generator, n_cards: int) -> pd.DataFrame:
    state_idx = rng.integers(0, len(_STATES), n_cards)
    states = np.array([_STATES[i][0] for i in state_idx])
    base_lat = np.array([_STATES[i][1] for i in state_idx])
    base_long = np.array([_STATES[i][2] for i in state_idx])

    is_male = rng.random(n_cards) < 0.5
    firsts = np.where(
        is_male,
        rng.choice(_FIRSTNAMES_M, n_cards),
        rng.choice(_FIRSTNAMES_F, n_cards),
    )

    # Ages 18-88, so `age` has a realistic spread rather than a narrow band.
    age_years = 18 + rng.beta(2.0, 2.6, n_cards) * 70
    dob = START - pd.to_timedelta(np.round(age_years * 365.25), unit="D")

    return pd.DataFrame(
        {
            "cc_num": 4_000_0000_0000_0000 + rng.choice(10**12, n_cards, replace=False),
            "first": firsts,
            "last": rng.choice(_SURNAMES, n_cards),
            "gender": np.where(is_male, "M", "F"),
            "street": [
                f"{n} {s} {x}"
                for n, s, x in zip(
                    rng.integers(10, 9999, n_cards),
                    rng.choice(_SURNAMES, n_cards),
                    rng.choice(_STREET_SUFFIX, n_cards),
                )
            ],
            "city": [
                f"{p} {s}"
                for p, s in zip(rng.choice(_CITY_PREFIX, n_cards), rng.choice(_SURNAMES, n_cards))
            ],
            "state": states,
            "zip": rng.integers(1001, 99950, n_cards),
            "lat": np.round(base_lat + rng.normal(0, 1.1, n_cards), 4),
            "long": np.round(base_long + rng.normal(0, 1.4, n_cards), 4),
            # Heavy-tailed town sizes: a few metros, mostly small towns.
            "city_pop": np.maximum(120, rng.lognormal(8.4, 2.1, n_cards).astype(np.int64)),
            "job": rng.choice(_JOBS, n_cards),
            "dob": dob,
            # Per-card activity multiplier -- some cards are used far more than others.
            "_activity": rng.gamma(2.0, 0.5, n_cards) + 0.15,
        }
    )


def _make_merchants(rng: np.random.Generator, n_merchants: int) -> pd.DataFrame:
    names = [
        f"fraud_{a}-{b}"
        for a, b in zip(
            rng.choice(_SURNAMES, n_merchants), rng.choice(_SURNAMES, n_merchants)
        )
    ]
    return pd.DataFrame(
        {
            "merchant": names,
            "category": rng.choice(CATEGORIES, n_merchants),
        }
    ).drop_duplicates(subset="merchant", ignore_index=True)


def generate_synthetic_sparkov(
    n_rows: int = 300_000,
    seed: int = 20260829,
    fraud_rate: float = 0.005,
) -> pd.DataFrame:
    """Generate a deterministic Sparkov-shaped frame with the raw column set.

    Returns rows sorted by ``trans_date_trans_time`` ascending. The same ``seed`` always
    produces a byte-identical frame, which is what makes the whole pipeline reproducible
    on a judge's machine with no dataset download.
    """
    if n_rows < 500:
        raise ValueError("n_rows must be >= 500 for the burst-fraud construction to work")

    rng = np.random.default_rng(seed)

    n_cards = max(40, n_rows // 250)
    cards = _make_cardholders(rng, n_cards)
    merchants = _make_merchants(rng, max(60, n_cards // 2))

    # --- assign transactions to cards, weighted by per-card activity ------------------
    weights = cards["_activity"].to_numpy()
    weights = weights / weights.sum()
    card_idx = rng.choice(n_cards, size=n_rows, p=weights)

    # --- timestamps ------------------------------------------------------------------
    span_s = int((END - START).total_seconds())
    # Time-of-day is not uniform: shoppers cluster in daytime/evening.
    day_offset = rng.integers(0, span_s // 86_400, n_rows)
    tod_hour = np.clip(rng.normal(14.0, 4.6, n_rows), 0, 23.999)
    secs = day_offset * 86_400 + (tod_hour * 3600).astype(np.int64)
    ts = START + pd.to_timedelta(secs, unit="s")

    # --- merchant / category ---------------------------------------------------------
    merch_idx = rng.integers(0, len(merchants), n_rows)
    category = merchants["category"].to_numpy()[merch_idx]

    mu = np.array([_CATEGORY_MU[c] for c in category])
    amt = np.round(np.exp(rng.normal(mu, 0.85)), 2)

    # Terminal geography: a legitimate purchase happens near where the cardholder lives.
    home_lat = cards["lat"].to_numpy()[card_idx]
    home_long = cards["long"].to_numpy()[card_idx]
    merch_lat = home_lat + rng.normal(0, 0.35, n_rows)
    merch_long = home_long + rng.normal(0, 0.45, n_rows)

    is_fraud = np.zeros(n_rows, dtype=np.int8)

    frame = pd.DataFrame(
        {
            "trans_date_trans_time": ts,
            "cc_num": cards["cc_num"].to_numpy()[card_idx],
            "merchant": merchants["merchant"].to_numpy()[merch_idx],
            "category": category,
            "amt": amt,
            "first": cards["first"].to_numpy()[card_idx],
            "last": cards["last"].to_numpy()[card_idx],
            "gender": cards["gender"].to_numpy()[card_idx],
            "street": cards["street"].to_numpy()[card_idx],
            "city": cards["city"].to_numpy()[card_idx],
            "state": cards["state"].to_numpy()[card_idx],
            "zip": cards["zip"].to_numpy()[card_idx],
            "lat": home_lat,
            "long": home_long,
            "city_pop": cards["city_pop"].to_numpy()[card_idx],
            "job": cards["job"].to_numpy()[card_idx],
            "dob": cards["dob"].to_numpy()[card_idx],
            "unix_time": (ts.astype("int64") // 10**9),
            "merch_lat": np.round(merch_lat, 6),
            "merch_long": np.round(merch_long, 6),
            "is_fraud": is_fraud,
        }
    )
    frame = frame.sort_values("trans_date_trans_time", kind="stable").reset_index(drop=True)

    frame = _inject_fraud_bursts(frame, rng, merchants, fraud_rate)

    # trans_num last, so it is a stable id over the final row order.
    frame["trans_num"] = [f"{v:032x}" for v in rng.integers(0, 2**63, len(frame))]
    frame["unix_time"] = frame["trans_date_trans_time"].astype("int64") // 10**9

    return frame.loc[:, list(RAW_COLUMNS)].reset_index(drop=True)


def _inject_fraud_bursts(
    frame: pd.DataFrame,
    rng: np.random.Generator,
    merchants: pd.DataFrame,
    fraud_rate: float,
) -> pd.DataFrame:
    """Compromise a card, then emit a short burst of fraudulent authorisations on it.

    Fraud is not an i.i.d. row flip: a stolen card gets hit several times within hours.
    That is what makes ``txn_count_1h`` / ``hours_since_last_txn`` carry real signal, and
    it is the property the attack engine's sparsity budget is measured against.
    """
    n_rows = len(frame)
    n_target = max(10, int(round(n_rows * fraud_rate)))

    order = np.argsort(frame["cc_num"].to_numpy(), kind="stable")
    cc_sorted = frame["cc_num"].to_numpy()[order]
    # Start index of each card's block within `order`.
    starts = np.flatnonzero(np.r_[True, cc_sorted[1:] != cc_sorted[:-1]])
    ends = np.r_[starts[1:], len(cc_sorted)]

    chosen: list[int] = []
    n_bursts = max(1, n_target // 5)
    picks = rng.choice(len(starts), size=min(n_bursts, len(starts)), replace=False)
    for p in picks:
        lo, hi = starts[p], ends[p]
        block = order[lo:hi]
        if len(block) < 4:
            continue
        burst = int(rng.integers(2, 9))
        # Bursts sit late in a card's history: the card was clean, then it wasn't.
        anchor = int(rng.integers(len(block) // 3, max(len(block) // 3 + 1, len(block) - 1)))
        chosen.extend(block[anchor : anchor + burst].tolist())
        if len(chosen) >= n_target:
            break

    idx = np.unique(np.array(chosen[:n_target], dtype=np.int64))
    n = len(idx)
    if n == 0:
        return frame

    # --- mutate the compromised rows -------------------------------------------------
    cat_p = _FRAUD_CATEGORY_WEIGHTS / _FRAUD_CATEGORY_WEIGHTS.sum()
    new_cat = rng.choice(np.array(CATEGORIES), size=n, p=cat_p)

    # Re-point each row at a merchant that actually sells the new category: the coupled
    # group (category_enc, merch_lat, merch_long, distance_km) must stay internally
    # consistent, or the attack engine is searching over transactions that cannot exist.
    merch_by_cat = {c: merchants.index[merchants["category"] == c].to_numpy() for c in CATEGORIES}
    new_merch_idx = np.array(
        [
            rng.choice(merch_by_cat[c]) if len(merch_by_cat[c]) else rng.integers(len(merchants))
            for c in new_cat
        ]
    )

    # Amounts: a card-testing tail of tiny authorisations plus a bulk-out tail.
    mu = np.array([_CATEGORY_MU[c] for c in new_cat])
    testing = rng.random(n) < 0.18
    big = np.round(np.exp(rng.normal(mu + 1.25, 0.75)), 2)
    small = np.round(rng.uniform(0.9, 6.0, n), 2)
    new_amt = np.where(testing, small, big)

    # Timing: pushed toward the 22:00-04:00 window, but not exclusively.
    ts = frame["trans_date_trans_time"].to_numpy()[idx].astype("datetime64[s]").astype("int64")
    at_night = rng.random(n) < 0.62
    night_secs = ((22 + rng.random(n) * 6) % 24 * 3600).astype("int64")
    day_start = (ts // 86_400) * 86_400
    ts = np.where(at_night, day_start + night_secs, ts)

    # Terminal geography: card-not-present fraud lands further from home.
    home_lat = frame["lat"].to_numpy()[idx]
    home_long = frame["long"].to_numpy()[idx]
    far = rng.random(n) < 0.55
    spread_lat = np.where(far, rng.normal(0, 2.6, n), rng.normal(0, 0.4, n))
    spread_long = np.where(far, rng.normal(0, 3.1, n), rng.normal(0, 0.5, n))

    frame.loc[idx, "category"] = new_cat
    frame.loc[idx, "merchant"] = merchants["merchant"].to_numpy()[new_merch_idx]
    frame.loc[idx, "amt"] = new_amt
    frame.loc[idx, "trans_date_trans_time"] = pd.to_datetime(ts, unit="s")
    frame.loc[idx, "merch_lat"] = np.round(home_lat + spread_lat, 6)
    frame.loc[idx, "merch_long"] = np.round(home_long + spread_long, 6)
    frame.loc[idx, "is_fraud"] = np.int8(1)

    return frame.sort_values("trans_date_trans_time", kind="stable").reset_index(drop=True)
