overrides: {
  users: {
    findOne: async ({ args, base }) => {
      const user = await base(args);
      return user?.active === false ? null : user;
    },
  },
},
