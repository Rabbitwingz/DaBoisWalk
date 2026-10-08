const { CONFIG, USERS, END, todayIST, requireUser, send, route } = require('./_lib');

module.exports = route(['GET'], async (req, res) => {
  const user = requireUser(req);
  send(res, 200, {
    user,
    name: USERS[user].name,
    config: Object.assign({}, CONFIG, { end: END }),
    today: todayIST()
  });
});
