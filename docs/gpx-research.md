# GPX intensity thresholds: research

MET values are from the 2024 Adult Compendium (pages opened on pacompendium.com). The 2011 Compendium PDF could not be read, so 2011 values are not used except where marked Secondary. Speeds in km/h are converted from the Compendium mph bands (x 1.609) or from yards/min (x 0.0548).

## 1. Program-ready thresholds

| Activity | Rule | Intensity | Source |
|---|---|---|---|
| Any, MET-based | < 3.0 METs = light; 3.0 to 5.9 = moderate; 6.0 or more = vigorous | Light / Moderate / Vigorous | WHO 2020 Table 1; CDC (both opened) |
| Any, heart rate | Max HR = 220 minus age (default), or 208 minus 0.7 x age (Tanaka) | n/a | Fox/Tanaka; Sarzynski 2013 (opened) |
| Any, heart rate (%HRmax) | 64-76% = moderate; 77-93% = vigorous | Moderate / Vigorous | CDC (Secondary, see confidence) |
| Any, heart rate (%HRR) | 40-59% = moderate; 60-89% = vigorous | Moderate / Vigorous | ACSM via Manitoba poster (Secondary) |
| Walking | < 4.0 km/h = light (2.3-2.8 METs); 4.0-7.1 km/h = moderate (3.0-5.5); 7.2 km/h or more = vigorous (7.0-8.5) | As stated | Compendium 2024: 17151-17231 |
| Running | 6.4 km/h or more = vigorous (6.5 METs at 6.4-6.8); 4.2-6.3 km/h = moderate (3.3 at 4.2-6.0); below 4.2 km/h use the walking rule | As stated | Compendium 2024: 12026, 12028 |
| Cycling, leisure | Below 16.1 km/h (10 mph) = moderate (4.0-5.8 METs); 16.1 km/h or more = vigorous (6.8 at 16.1-19.2; 8.0 at 19.3-22.4; 10.0 at 22.5-25.6) | As stated | Compendium 2024: 01010-01040 |
| Swimming, open water (GPS) | No speed band; use 6.0 METs (lake, ocean, river; "leisurely") | Vigorous | Compendium 2024: 18300, 18310 |
| Swimming, crawl by speed | 1.6-2.5 km/h (30-45 yd/min) = moderate (5.8); 2.6 km/h or more = vigorous (8.0 at 2.7; 10.5 at 4.1; 14.5 above 4.9) | As stated | Compendium 2024: 18292, 18290, 18280, 18294 |
| Pool swim | No GPS track; reject the upload | n/a | Brief |

Running answer: not all running is 6 METs or more. Jogging at 4.2-6.0 km/h is 3.3 METs (moderate).

## 2. Citations

- CDC, How to Measure Physical Activity Intensity (opened, MET cut-offs): https://www.cdc.gov/physical-activity-basics/measuring/index.html
- CDC, Target Heart Rate and Estimated Maximum Heart Rate (404 on two fetches; ranges taken from a search snippet only): https://www.cdc.gov/physicalactivity/basics/measuring/heartrate.htm
- WHO 2020 Guidelines on physical activity and sedentary behaviour, Table 1 (opened): https://pmc.ncbi.nlm.nih.gov/articles/PMC7719906/
- Compendium 2024 Adult, walking, running, bicycling, water activities (all opened): https://pacompendium.com/walking, /running, /bicycling, /water-activities
- Compendium 2011 (Ainsworth et al., Med Sci Sports Exerc, 2011), PDF (not readable): https://fitmum.ku.dk/2011_Compendium_of_Physical_Activities.pdf
- Sarzynski MA et al., Am J Hum Biol, 2013, HRmax equations in 762 adults (opened): https://pmc.ncbi.nlm.nih.gov/articles/PMC3935487
- Tanaka H, Monahan KD, Seals DR, J Am Coll Cardiol 2001;37:153-6, "Age-predicted maximal heart rate revisited" (abstract blocked; details from search summary): https://pubmed.ncbi.nlm.nih.gov/11153730/
- ACSM %HRR bands, Manitoba Education poster (search summary): https://www.edu.gov.mb.ca/k12/cur/physhlth/docs/poster.pdf
- ACSM comparison table (reCAPTCHA, not opened; search summary gives vigorous as 60-84% HRR): https://pmc.ncbi.nlm.nih.gov/articles/PMC8581515/table/T1
- Child and adolescent athlete HRmax systematic review, Fisioterapia em Movimento 2018 (search summary): https://periodicos.pucpr.br/fisio/article/view/24189

## 3. Confidence notes

1. Heart rate. CDC %HRmax ranges: low to medium (page not opened). ACSM vigorous upper bound conflicts (84, 89 or 90% HRR); 89 is used above. Age formulas: medium; both have standard errors of about 11-12 bpm in adults (Sarzynski 2013), so they are population estimates.
2. METs. Cut-offs: high. Walking, running, cycling (2024 edition): high; applying them to 2011 values is medium, since a 2011 summary gives 9.8 METs at 6.0 mph where 2024 gives 9.3. Cycling 01020 is labelled "light effort" but its 6.8 METs are vigorous, so use the MET value, not the label. Swimming: low (no pool entries, km/h derived from yards/min, and the 2.6 km/h boundary is my midpoint). Some Compendium values are marked as estimates (red), which the text copy does not show.
3. Children. Medium. Secondary reviews find 220 minus age overestimates youth HRmax, and 208 minus 0.7 x age fits better in some studies. No CDC or ACSM pediatric rule was found. Recommend measured HRmax or the MET method for under-18s.
