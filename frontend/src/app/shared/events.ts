export const SocketEvents = {
  // player -> server
  PlayerJoin: 'player:join',
  PlayerVote: 'player:vote',
  PlayerAnswer: 'player:answer',

  // host -> server
  HostConfigure: 'host:configure',
  HostStartGame: 'host:startGame',
  HostPause: 'host:pause',
  HostResume: 'host:resume',
  HostNewGame: 'host:newGame',

  // server -> all
  GameState: 'game:state',
  LobbyPlayers: 'lobby:players',
  CategoryOptions: 'category:options',
  VoteUpdate: 'vote:update',
  CategoryResult: 'category:result',
  QuestionShow: 'question:show',
  QuestionReveal: 'question:reveal',
  RoundSummary: 'round:summary',
  GameEnd: 'game:end',
  ErrorNotice: 'error:notice',
} as const;
