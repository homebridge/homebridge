import * as crypto from 'crypto';

export function generate(data: any) {
  const sha1sum = crypto.createHash('sha1');
  sha1sum.update(data);
  const s = sha1sum.digest('hex');
  let i = -1;
  return 'xx:xx:xx:xx:xx:xx'.replace(/[x]/g, (c) => {
    i += 1;
    return s[i];
  }).toUpperCase();
};