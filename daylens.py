"""DayLens MVP: privacy-first Windows activity tracker.

Backward-compatible entry point wrapper. Core modules are located in the `daylens/` package.
"""
from daylens.__init__ import (
    DB_PATH,
    ROOT,
    add_activity,
    categorize,
    connect,
    demo,
    get_category_rules,
    get_hourly_stats,
    is_paused,
    report,
    resolve_date_range,
    save_category_rule,
    set_paused,
    summary,
    track,
    windows_state,
)
from daylens.cli import main

if __name__ == "__main__":
    main()
