/* WHO 2020 guideline by age group and its copy. Moved verbatim from web/js/app.js. */
/* ===== WHO 2020 guideline by age group (the single source of every target and target copy) =====
   aerobic: weekly minutes target. vigorousMultiplier: credit per vigorous minute (2 is the adult
   equivalence; children count 1:1). muscleDays / vigorousDays / balanceDays: days per week, 0 = not tracked.
   lane: tick and label spacing on the lane scale.
   stretch: optional stretch goal in minutes, shown once the target is met (adult and 65+ only; absent = none). */
export const GUIDE = {
  child: {
    key: 'child', minAge: 5, maxAge: 17,
    aerobic: 420, perDay: 60, vigorousMultiplier: 1,
    muscleDays: 3, muscleLabel: 'Strength days', vigorousDays: 3, balanceDays: 0,
    lane: { tick: 30, label: 60 },
    copy: {
      chip: 'Age 5 to 17 guideline',
      h1: 'Bank 420 minutes this week.',
      lead: 'That is about 60 minutes a day on average. Play, sport, PE and walking or cycling to school all count. Log what you did and watch your lane fill.',
      logNote: 'For ages 5 to 17, moderate and vigorous minutes count the same toward 420.',
      muscleHelp: 'WHO also suggests vigorous activity and muscle- and bone-strengthening on 3 or more days a week. Running, jumping and sport help build bone.',
      met: 'Target met. Anything extra still counts, so keep playing.',
      zero: 'One active game or a walk to school today is a real start.',
      lastDay: 'A long game outside, a bike ride or a sports session would do it.',
      footer: 'For ages 5 to 17, Weekly 150 follows the WHO guideline: an average of 60 minutes a day of moderate to vigorous activity, plus vigorous activity and muscle- and bone-strengthening on 3 or more days a week.',
      fact: { stat: '60 min a day', claim: "WHO's 2020 guideline for children and adolescents aged 5 to 17 is an average of 60 minutes a day of moderate to vigorous activity, with vigorous activity and muscle- and bone-strengthening on 3 or more days a week." }
    }
  },
  adult: {
    key: 'adult', minAge: 18, maxAge: 64,
    aerobic: 150, stretch: 300, perDay: 0, vigorousMultiplier: 2,
    muscleDays: 2, muscleLabel: 'Strength days', vigorousDays: 0, balanceDays: 0,
    lane: { tick: 10, label: 30 },
    copy: {
      chip: 'Adult 18 to 64 guideline',
      h1: 'Bank 150 minutes this week.',
      lead: 'Two brisk walks and a few short sessions add up faster than you think. Log what you did, watch your lane fill, come back tomorrow.',
      logNote: 'Vigorous minutes count double toward 150, as in the WHO guideline.',
      muscleHelp: 'WHO also suggests muscle work on 2 or more days a week.',
      met: 'Target met. Anything extra still counts: more activity brings more benefit, up to 300 minutes and beyond.',
      zero: 'One 10-minute walk today is a real start.',
      lastDay: '',
      footer: 'Weekly 150 follows the WHO guideline for adults: at least 150 minutes of moderate activity a week, or 75 of vigorous, plus muscle work on 2 or more days.',
      fact: null
    }
  },
  older: {
    key: 'older', minAge: 65, maxAge: 120,
    aerobic: 150, stretch: 300, perDay: 0, vigorousMultiplier: 2,
    muscleDays: 2, muscleLabel: 'Strength days', vigorousDays: 0, balanceDays: 3,
    lane: { tick: 10, label: 30 },
    copy: {
      chip: 'Age 65 and over guideline',
      h1: 'Bank 150 minutes this week.',
      lead: 'Walks, gardening and a few short sessions add up faster than you think. Log what you did, watch your lane fill, and keep some strength and balance work in the mix.',
      logNote: 'Vigorous minutes count double toward 150, as in the WHO guideline.',
      muscleHelp: 'WHO also suggests muscle work on 2 or more days a week, and balance and strength activity at moderate effort or more on 3 or more days to help prevent falls.',
      met: 'Target met. Anything extra still counts: more activity brings more benefit, up to 300 minutes and beyond.',
      zero: 'One 10-minute walk today is a real start.',
      lastDay: '',
      balanceHelp: 'Moves that test your balance, like tai chi, dancing or standing on one leg, help prevent falls. Count sessions at moderate effort or more.',
      footer: 'For ages 65 and over, Weekly 150 follows the WHO guideline: the adult target of at least 150 minutes of moderate activity a week, or 75 of vigorous, plus muscle work on 2 or more days and balance and strength activity at moderate effort or more on 3 or more days to help prevent falls.',
      fact: { stat: '150 min', claim: "WHO's 2020 guideline for adults 65 and over matches the adult one (150 to 300 minutes of moderate activity a week, or 75 to 150 vigorous, plus muscle-strengthening on 2 or more days) and adds balance and strength activity at moderate effort or more on 3 or more days to help prevent falls." }
    }
  }
};
/* copy used before an age is set (adult preview) or for under-5s (no targets shown) */
export const GUIDE_NOTE = {
  unsetChip: 'Preview: adult targets until you set your age',
  under5Chip: 'Under 5: no targets here',
  under5H1: 'Made for ages 5 and up.',
  under5Lead: 'Young children need plenty of active play. WHO has a separate guide for under-5s that covers movement, sleep and screen time.',
  footer: 'Weekly 150 follows the WHO 2020 guideline: for adults, at least 150 minutes of moderate activity a week, or 75 of vigorous, plus muscle work on 2 or more days. Children aged 5 to 17 and adults 65 and over have their own targets, set from your age.'
};

/* 'unset' (no age yet), 'under5', or a GUIDE key: 'child', 'adult', 'older' */
export function ageGroup(age) {
  if (age === null || age === undefined) return 'unset';
  if (age < 5) return 'under5';
  if (age <= GUIDE.child.maxAge) return 'child';
  if (age <= GUIDE.adult.maxAge) return 'adult';
  return 'older';
}
export function hasTargets(age) { return !!GUIDE[ageGroup(age)]; }
/* The guide every readout uses. Before an age is set the page previews the adult guide.
   Under-5s get no targets on screen; their minutes are counted 1:1 like the child group. */
export function activeGuide(age) {
  const k = ageGroup(age);
  return GUIDE[k] || (k === 'under5' ? GUIDE.child : GUIDE.adult);
}
