import {
  createRequestValidator,
  requestField,
} from "./request.js";

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const name = requestField.text({
  minimumCodePoints: 1,
  maximumCodePoints: 100,
  maximumBytes: 400,
  trim: true,
  normalization: "NFC",
});
const email = requestField.text({
  minimumCodePoints: 3,
  maximumCodePoints: 254,
  maximumBytes: 254,
  trim: true,
  lowercase: true,
  normalization: "NFC",
  pattern: EMAIL_PATTERN,
});
const registrationPassword = requestField.text({
  minimumCodePoints: 1,
  maximumCodePoints: 128,
  maximumBytes: 512,
});
const loginPassword = requestField.text({
  minimumCodePoints: 1,
  maximumCodePoints: 1_024,
  maximumBytes: 4_096,
});
const category = requestField.optional(requestField.text({
  maximumCodePoints: 80,
  maximumBytes: 320,
  trim: true,
  normalization: "NFC",
}));
const searchQuery = requestField.optional(requestField.text({
  maximumCodePoints: 120,
  maximumBytes: 480,
  trim: true,
  normalization: "NFC",
}));
const noticeFlag = requestField.optional(requestField.enumeration(["1"]));

export const publicInputValidation = Object.freeze({
  registrationPage: createRequestValidator({ query: {} }),
  registration: createRequestValidator({
    body: {
      name,
      email,
      password: registrationPassword,
      passwordConfirmation: registrationPassword,
    },
  }),
  loginPage: createRequestValidator({
    query: {
      registered: noticeFlag,
      signedOut: noticeFlag,
    },
  }),
  login: createRequestValidator({
    body: {
      email,
      password: loginPassword,
    },
  }),
  logout: createRequestValidator({ body: {} }),
  menu: createRequestValidator({
    query: { category },
  }),
  search: createRequestValidator({
    query: {
      q: searchQuery,
      category,
    },
  }),
});
