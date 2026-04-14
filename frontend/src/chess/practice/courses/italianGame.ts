import { buildOpeningCourse } from '../builder'
import type { OpeningCourseDraft } from '../types'

const italianGameDraft: OpeningCourseDraft = {
  id: 'white-italian-game',
  slug: 'italian-game',
  name: 'Italian Game',
  subtitle: 'Fast development, pressure on f7, and simple attacking play',
  description:
    'A pilot repertoire course for White built around the Italian. Start with clean development, learn the quiet Giuoco Piano setups, then study the tactical forks and anti-Fried-Liver ideas that club players hit all the time.',
  studyAs: 'white',
  category: 'opening',
  family: 'Italian Game',
  tags: ['white', 'e4', 'open-game', 'italian', 'giuoco-piano', 'two-knights'],
  chapters: [
    {
      id: 'giuoco-piano',
      title: 'Giuoco Piano Basics',
      summary: 'Build a calm center, castle, and keep the Italian bishop active.',
      lines: [
        {
          id: 'giuoco-pianissimo-main',
          title: 'Pianissimo Main Setup',
          summary: 'The most stable Italian structure: c3, d3, castle, then improve.',
          moves: [
            { san: 'e4', explanation: 'Claim space in the center and open lines for the bishop and queen.' },
            { san: 'e5', explanation: 'Black mirrors the center and keeps the game open.' },
            {
              san: 'Nf3',
              explanation: 'Develop with tempo by attacking e5 and preparing quick castling.',
              acceptedAlternatives: [
                { san: 'Bc4', message: 'Playable, but this course develops the knight first to pressure e5.' },
              ],
            },
            { san: 'Nc6', explanation: 'Black protects e5 and develops naturally.' },
            {
              san: 'Bc4',
              explanation: 'Place the bishop on the classic Italian square and point it at f7.',
              acceptedAlternatives: [
                { san: 'Bb5', message: 'That is the Ruy Lopez. In this course we want the Italian bishop on c4.' },
                { san: 'd4', message: 'Playable, but this course keeps development simple before the central break.' },
              ],
            },
            { san: 'Bc5', explanation: 'Black copies the bishop development and eyes f2.' },
            {
              san: 'c3',
              explanation: 'Support a future d4 break and take control of the d4 square.',
              acceptedAlternatives: [
                { san: 'd3', message: 'Solid, but this line wants c3 first so d4 is ready later.' },
              ],
            },
            { san: 'Nf6', explanation: 'Black develops and attacks e4.' },
            {
              san: 'd3',
              explanation: 'Defend e4, keep the center compact, and prepare to castle safely.',
              acceptedAlternatives: [
                { san: 'd4', message: 'Playable, but this line is the calmer Pianissimo structure.' },
              ],
            },
            { san: 'd6', explanation: 'Black reinforces e5 and keeps the center solid.' },
            {
              san: 'O-O',
              explanation: 'Castle early so your rook can join the center play and your king stays safe.',
            },
            { san: 'O-O', explanation: 'Black also gets the king safe before middlegame play starts.' },
          ],
        },
        {
          id: 'giuoco-pianissimo-a6',
          title: 'Pianissimo vs ...a6 and ...Ba7',
          summary: 'Keep the bishop flexible and do not rush the center.',
          moves: [
            { san: 'e4', explanation: 'Grab central space and steer into open-game territory.' },
            { san: 'e5', explanation: 'Black meets the center directly.' },
            { san: 'Nf3', explanation: 'Develop and ask e5 a question immediately.' },
            { san: 'Nc6', explanation: 'Black protects e5 and keeps options open.' },
            { san: 'Bc4', explanation: 'Choose the Italian bishop placement and eye f7.' },
            { san: 'Bc5', explanation: 'Black develops symmetrically.' },
            { san: 'c3', explanation: 'Prepare d4 later and keep the bishop covered.' },
            { san: 'Nf6', explanation: 'Black develops with pressure on e4.' },
            { san: 'd3', explanation: 'Hold the center together before expanding.' },
            { san: 'a6', explanation: 'Black hints at ...Ba7 and wants more queenside space.' },
            {
              san: 'O-O',
              explanation: 'Castle first. In these quiet Italians, king safety comes before fancy ideas.',
            },
            { san: 'Ba7', explanation: 'Black preserves the bishop on the long diagonal.' },
          ],
        },
        {
          id: 'hungarian-defense',
          title: 'Italian vs the Hungarian Defense',
          summary: 'Stay simple when Black avoids the main Italian bishop battle.',
          moves: [
            { san: 'e4', explanation: 'Occupy the center and open your light-squared bishop.' },
            { san: 'e5', explanation: 'Black keeps the game open.' },
            { san: 'Nf3', explanation: 'Develop with tempo and prepare to castle.' },
            { san: 'Nc6', explanation: 'Black defends e5.' },
            { san: 'Bc4', explanation: 'Choose the Italian setup and pressure f7.' },
            { san: 'Be7', explanation: 'Black heads for the Hungarian Defense and avoids early bishop tension.' },
            {
              san: 'd3',
              explanation: 'Stay flexible, support e4, and keep a smooth development plan.',
              acceptedAlternatives: [
                { san: 'Nc3', message: 'Playable, but this course keeps the center compact with d3 first.' },
              ],
            },
            { san: 'Nf6', explanation: 'Black develops naturally and prepares to castle.' },
            { san: 'O-O', explanation: 'Castle before choosing your middlegame plan.' },
            { san: 'O-O', explanation: 'Black also finishes king safety.' },
          ],
        },
      ],
    },
    {
      id: 'two-knights-quiet',
      title: 'Quiet Two Knights Setups',
      summary: 'When Black plays ...Nf6 early, keep the position under control before tactics appear.',
      lines: [
        {
          id: 'two-knights-d3-bc5',
          title: 'Two Knights with d3 and ...Bc5',
          summary: 'A quiet system that feels like a blend of the Italian and the Giuoco Piano.',
          moves: [
            { san: 'e4', explanation: 'Start with central space and open lines.' },
            { san: 'e5', explanation: 'Black responds symmetrically.' },
            { san: 'Nf3', explanation: 'Develop and pressure e5.' },
            { san: 'Nc6', explanation: 'Black protects the center.' },
            { san: 'Bc4', explanation: 'Head into the Italian and point at f7.' },
            { san: 'Nf6', explanation: 'Black chooses the Two Knights move order.' },
            {
              san: 'd3',
              explanation: 'Keep e4 protected and avoid rushing into tactics you do not need yet.',
              acceptedAlternatives: [
                { san: 'Ng5', message: 'Sharp, but that enters the tactical Fried Liver family instead of this quiet line.' },
              ],
            },
            { san: 'Bc5', explanation: 'Black develops naturally and keeps the game balanced.' },
            { san: 'O-O', explanation: 'Castle first so your next plans happen with a safe king.' },
            { san: 'd6', explanation: 'Black supports e5 and keeps the center together.' },
          ],
        },
        {
          id: 'two-knights-d3-be7',
          title: 'Two Knights with ...Be7',
          summary: 'Meet the quieter bishop setup with the same disciplined Italian structure.',
          moves: [
            { san: 'e4', explanation: 'Take central space and keep options open.' },
            { san: 'e5', explanation: 'Black mirrors the center.' },
            { san: 'Nf3', explanation: 'Develop with pressure and prepare to castle.' },
            { san: 'Nc6', explanation: 'Black supports e5.' },
            { san: 'Bc4', explanation: 'Choose the Italian bishop and eye f7.' },
            { san: 'Nf6', explanation: 'Black enters Two Knights territory.' },
            { san: 'd3', explanation: 'Keep the position under control and support e4.' },
            { san: 'Be7', explanation: 'Black develops more quietly and avoids immediate tactics.' },
            { san: 'O-O', explanation: 'Castle now. In these structures, safety and coordination matter most.' },
            { san: 'O-O', explanation: 'Black also gets safe before the middlegame starts.' },
            { san: 'Re1', explanation: 'Bring the rook to the center and reinforce the e4 pawn.' },
            { san: 'd6', explanation: 'Black completes the basic shell and waits for your plan.' },
          ],
        },
      ],
    },
    {
      id: 'fried-liver-awareness',
      title: 'Fried Liver and Tactical Awareness',
      summary: 'Know when to go sharp and how to handle the club-player tactical branches.',
      lines: [
        {
          id: 'anti-fried-liver-main',
          title: 'Ng5 and the Main Anti-Fried-Liver Setup',
          summary: 'When Black avoids the pure Fried Liver with ...Na5, keep initiative without overextending.',
          moves: [
            { san: 'e4', explanation: 'Take the center and keep the game open.' },
            { san: 'e5', explanation: 'Black meets the center head on.' },
            { san: 'Nf3', explanation: 'Develop and pressure e5.' },
            { san: 'Nc6', explanation: 'Black protects e5 and develops.' },
            { san: 'Bc4', explanation: 'The Italian bishop appears and targets f7.' },
            { san: 'Nf6', explanation: 'Black chooses the Two Knights Defense.' },
            {
              san: 'Ng5',
              explanation: 'Jump into the tactical branch and pile more pressure onto f7.',
              acceptedAlternatives: [
                { san: 'd3', message: 'Solid, but this chapter is specifically about the sharp Ng5 lines.' },
              ],
            },
            { san: 'd5', explanation: 'Black strikes the center and challenges the bishop immediately.' },
            { san: 'exd5', explanation: 'Take in the center so the e-file opens and tactical ideas stay alive.' },
            { san: 'Na5', explanation: 'Black kicks the bishop and heads for the anti-Fried-Liver setup.' },
            { san: 'Bb5+', explanation: 'Give check first so Black spends time responding before recapturing the pawn.' },
            { san: 'c6', explanation: 'Black blocks the check and asks the bishop line to resolve.' },
            { san: 'dxc6', explanation: 'Grab on c6 before retreating so you damage Black pawn structure.' },
            { san: 'bxc6', explanation: 'Black restores material but accepts a weaker queenside structure.' },
          ],
        },
        {
          id: 'lolli-knight-fork',
          title: 'The Knight Fork on f7',
          summary: 'A classic tactical shot every Italian player should recognize on sight.',
          moves: [
            { san: 'e4', explanation: 'Claim the center and open your lines.' },
            { san: 'e5', explanation: 'Black mirrors the center.' },
            { san: 'Nf3', explanation: 'Develop and challenge e5.' },
            { san: 'Nc6', explanation: 'Black defends the pawn.' },
            { san: 'Bc4', explanation: 'Point the bishop at f7 and keep tactical pressure available.' },
            { san: 'Nf6', explanation: 'Black enters the Two Knights Defense.' },
            { san: 'Ng5', explanation: 'Jump forward and threaten the weak f7 square.' },
            { san: 'd5', explanation: 'Black counters in the center instead of defending passively.' },
            { san: 'exd5', explanation: 'Open lines and keep the attack alive.' },
            { san: 'Nxd5', explanation: 'Black recaptures with the knight and leaves tactical ideas hanging.' },
            { san: 'Nxf7', explanation: 'Fork the king and rook. This is the tactical point you must spot quickly.' },
          ],
        },
        {
          id: 'traxler-awareness',
          title: 'Traxler Awareness',
          summary: 'Know the club-player sideline so you are not shocked when Black goes for chaos.',
          moves: [
            { san: 'e4', explanation: 'Take space and open the game.' },
            { san: 'e5', explanation: 'Black answers classically.' },
            { san: 'Nf3', explanation: 'Develop and pressure e5.' },
            { san: 'Nc6', explanation: 'Black supports the center.' },
            { san: 'Bc4', explanation: 'Choose the Italian setup and eye f7.' },
            { san: 'Nf6', explanation: 'Black heads into Two Knights territory.' },
            { san: 'Ng5', explanation: 'Apply direct pressure on f7 and invite tactical play.' },
            { san: 'Bc5', explanation: 'Black chooses the Traxler Counterattack instead of defending quietly.' },
            { san: 'Bxf7+', explanation: 'Take on f7 with check and force Black to react immediately.' },
            { san: 'Ke7', explanation: 'Black steps toward the center to keep material balance.' },
            { san: 'Bb3', explanation: 'Retreat the bishop to safety and keep the long diagonal alive for later.' },
          ],
        },
      ],
    },
  ],
}

export const ITALIAN_GAME_COURSE = buildOpeningCourse(italianGameDraft)
