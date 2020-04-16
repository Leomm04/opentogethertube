const { getLogger } = require('./logger.js');
const securePassword = require('secure-password');
const express = require('express');
const passport = require('passport');
const crypto = require('crypto');
const { uniqueNamesGenerator } = require('unique-names-generator');
const { User } = require("./models");
const roommanager = require("./roommanager");

const pwd = securePassword();
const log = getLogger("usermanager");
const router = express.Router();

router.get("/", (req, res) => {
	if (req.user) {
		let user = {
			username: req.user.username,
			loggedIn: true,
		};
		res.json(user);
	}
	else {
		res.json({
			username: req.session.username,
			loggedIn: false,
		});
	}
});

router.post("/", async (req, res) => {
	if (!req.body.username) {
		res.status(400).json({
			success: false,
			error: {
				message: "Missing argument (username)",
			},
		});
		return;
	}
	let oldUsername;
	if (req.user) {
		oldUsername = req.user.username;
		req.user.username = req.body.username;
		try {
			await req.user.save();
		}
		catch (err) {
			if (err.name === "SequelizeUniqueConstraintError") {
				await req.user.reload();
				res.status(400).json({
					success: false,
					error: {
						name: "UsernameTaken",
						message: "Somebody else is already using that username.",
					},
				});
				return;
			}
			else {
				log.error(`Unknown error occurred when saving user to database ${err.message}`);
				res.status(500).json({
					success: false,
					error: {
						message: "An unknown error occurred.",
					},
				});
				return;
			}
		}
		res.json({
			success: true,
		});
	}
	else {
		oldUsername = this.session.username;
		this.session.username = req.body.username;
		this.session.save();
		res.json({
			success: true,
		});
	}
	log.info(`${oldUsername} changed username to ${req.body.username}`);
	usermanager.onUserModified(req.session);
});

router.post("/login", (req, res, next) => {
	passport.authenticate("local", (err, user) => {
		if (err) {
			res.status(401).json({
				success: false,
				error: {
					message: err.message,
				},
			});
			return;
		}
		if (user) {
			req.login(user, (err) => {
				if (err) {
					log.error("Unknown error when logging in");
					res.status(500).json({
						success: false,
						error: {
							message: "An unknown error occurred when logging in.",
						},
					});
					return;
				}
				delete req.session.username;
				req.session.save();
				try {
					usermanager.onUserLogIn(user, req.session);
				}
				catch (err) {
					log.error(`An unknown error occurred when running onUserLogIn: ${err} ${err.message}`);
				}
				res.json({
					success: true,
					user: user,
				});
			});
		}
		else {
			res.status(401).json({
				success: false,
				error: {
					message: "Either the email or password was not provided.",
				},
			});
		}
	})(req, res, next);
});

router.post("/logout", (req, res) => {
	if (req.user) {
		let user = req.user;
		req.logout();
		usermanager.onUserLogOut(user, req.session);
		res.json({
			success: true,
		});
	}
	else {
		res.json({
			success: false,
			error: {
				message: "Not logged in.",
			},
		});
	}
});

router.post("/register", (req, res) => {
	usermanager.registerUser(req.body).then(result => {
		req.login(result, () => {
			delete req.session.username;
			req.session.save();
			try {
				usermanager.onUserLogIn(result, req.session);
			}
			catch (err) {
				log.error(`An unknown error occurred when running onUserLogIn: ${err} ${err.message}`);
			}
			res.json({
				success: true,
				user: result,
			});
		});
	}).catch(err => {
		log.error(`Unable to register user ${err} ${err.message}`);
		if (err.name === "SequelizeUniqueConstraintError") {
			let fields = err.fields.join(", ");
			fields = fields.charAt(0).toUpperCase() + fields.slice(1);
			res.status(400).json({
				success: false,
				error: {
					message: `${fields} ${err.fields.length > 1 ? "are" : "is"} already in use.`,
				},
			});
		}
		else {
			res.status(500).json({
				success: false,
				error: {
					name: "Unknown",
					message: "An unknown error occurred. Try again later.",
				},
			});
		}
	});
});

let usermanager = {
	router,

	/**
	 * Callback used by passport LocalStrategy to authenticate Users.
	 */
	async authCallback(email, password, done) {
		// HACK: required to use usermanager inside passport callbacks that are inside usermanager. This is because `this` becomes `global` inside these callbacks for some fucking reason
		let usermanager = require("./usermanager.js");
		// if (process.env.NODE_ENV !== 'production') {
		// 	if (email === "test@localhost" && password === "test") {
		// 		done(null, await usermanager.getUser({ email }));
		// 		return;
		// 	}
		// }
		let user;
		try {
			user = await usermanager.getUser({ email });
		}
		catch (err) {
			done(new Error("Email or password is incorrect."));
			return;
		}
		let result = await pwd.verify(Buffer.from(user.salt + password), Buffer.from(user.hash));
		switch (result) {
			case securePassword.INVALID_UNRECOGNIZED_HASH:
				log.error(`${email}: Unrecognized hash. I don't think this should ever happen.`);
				done(null, false);
				break;
			case securePassword.INVALID:
				log.debug(`${email}: Hash is invalid`);
				done(new Error("Email or password is incorrect."), false);
				break;
			case securePassword.VALID_NEEDS_REHASH:
				log.debug(`${email}: Hash is valid, needs rehash`);
				user.hash = await pwd.hash(Buffer.from(user.salt + password));
				await user.save();
			// eslint-disable-next-line no-fallthrough
			case securePassword.VALID:
				log.debug(`${email}: Hash is valid`);
				done(null, user);
				break;

			default:
				break;
		}
	},

	/**
	 * Converts a User into their user id.
	 * Used for persistent session storage.
	 */
	serializeUser(user, done) {
		done(null, user.id);
	},

	/**
	 * Converts a user id into a User.
	 * Used for persistent session storage.
	 */
	async deserializeUser(id, done) {
		// HACK: required to use usermanager inside passport callbacks that are inside usermanager. This is because `this` becomes `global` inside these callbacks for some fucking reason
		let usermanager = require("./usermanager.js");
		try {
			let user = await usermanager.getUser({ id });
			done(null, user);
		}
		catch (err) {
			log.error(`Unable to deserialize user id=${id} ${err}`);
			done(err, null);
		}
	},

	async registerUser({ email, username, password }) {
		let salt = crypto.randomBytes(256).toString('base64');
		let hash = await pwd.hash(Buffer.from(salt + password));

		return User.create({
			email,
			username,
			salt,
			hash,
		}).then(user => {
			return user;
		}).catch(err => {
			log.error(`Failed to create new user in the database: ${err} ${err.message}`);
			throw err;
		});
	},

	/**
	 * Gets a User based on either their email or id.
	 * @param {*} param0
	 * @returns Promise<User>
	 */
	async getUser({ email, id }) {
		if (!email && !id) {
			log.error("Invalid parameters to find user");
			throw new Error("Invalid parameters to find user");
		}
		// if (process.env.NODE_ENV !== 'production' && (email === "test@localhost" || id === -1)) {
		// 	return Promise.resolve(User.build({ id: -1, email, username: "test user" }));
		// }
		let where = {};
		if (email) {
			where = { email };
		}
		else if (id) {
			where = { id };
		}
		return User.findOne({ where }).then(user => {
			if (!user) {
				log.error("User not found");
				throw new Error("User not found");
			}
			return user;
		});
	},

	onUserLogIn(user, session) {
		log.info(`${user.username} (id: ${user.id}) has logged in.`);
		for (let room of roommanager.rooms) {
			for (let client of room.clients) {
				if (client.session.id === session.id) {
					client.user = user;
					room._dirtyProps.push("users");
					break;
				}
			}
		}
	},

	onUserLogOut(user, session) {
		log.info(`${user.username} (id: ${user.id}) has logged out.`);
		for (let room of roommanager.rooms) {
			for (let client of room.clients) {
				if (client.session.id === session.id) {
					client.user = null;
					room._dirtyProps.push("users");
					break;
				}
			}
		}
		let username = uniqueNamesGenerator();
		log.debug(`Generated name for new user (on log out): ${username}`);
		session.username = username;
		session.save();
	},

	onUserModified(session) {
		for (let room of roommanager.rooms) {
			for (let client of room.clients) {
				if (client.session.id === session.id) {
					if (client.isLoggedIn) {
						client.user.reload();
					}
					room._dirtyProps.push("users");
					break;
				}
			}
		}
	},
};

module.exports = usermanager;
