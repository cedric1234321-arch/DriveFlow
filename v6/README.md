# DriveFlow V6 development

This folder contains the isolated V6 business/intelligence layer. It is intentionally not wired to the production UI yet.

## Financial model

- Gross CA
- Fuel cost (historical price + historical vehicle consumption)
- Optional URSSAF social contributions calculated on gross CA
- Final net = gross CA - fuel - URSSAF when enabled
- Savings are calculated from final available net

URSSAF presets currently supported in the core:
- ACRE legacy: 10.6%
- ACRE from 1 July 2026: 15.9%
- Standard BIC services: 21.2%

The UI will use an enable/disable switch for URSSAF. There is no separate 0% preset; disabled is equivalent to not applying URSSAF.

## Savings rules

A default rule can be overridden week by week:
- fixed amount per worked day
- fixed weekly amount
- percentage of net

Changing the current week never alters previous weeks.

## Intelligence

The on-device engine uses comparable historical sessions with weights for:
- weekday
- start time
- planned duration
- recency
- time-data quality
- future weather similarity hook (not active until weather enrichment is validated)

Outputs include:
- expected CA/hour
- expected CA
- 15th-85th percentile usual range
- expected km/fuel/net
- effective sample size
- confidence level
- weekly plan generation from user availability and objectives

## Weekly planner

Supported priorities:
- minimize working time
- minimize number of sessions
- maximize CA
- maximize hourly rate

The planner checks both gross CA and savings/net objectives.

## Weather status

Weather is not yet embedded in DriveFlow. The target source is Open-Meteo historical hourly weather for Montpellier, with temperature, apparent temperature, precipitation/rain, weather code, wind speed and gusts. A weather-similarity hook is already present in the intelligence engine, but it will only be enabled after a walk-forward backtest confirms that weather improves predictions.

## Safety

The existing `main` branch remains the V5 production app. V6 development is isolated on `v6-development` until migration, UI and regression tests are complete.
