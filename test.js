'use strict';

const {resolve, sep} = require('path');

const Observable = require('zen-observable');
const pretendPlatform = require('pretend-platform');
const rmfr = require('rmfr');
const spawnStack = require('.');
const test = require('tape');

test('spawnStack() with no `stack` command', async t => {
  t.plan(2);

  pretendPlatform('aix');

  const fail = t.fail.bind(t, 'Unexpectedly succeeded.');
  const options = {
    cwd: resolve('C:/none/exists/'),
    env: {}
  };

  await spawnStack(['--version'], options).then(fail, err => {
    t.strictEqual(
      err.toString(),
      'Error: `stack` command is not found in your PATH. Make sure you have instaled Stack. ' +
      'https://docs.haskellstack.org/en/stable/install_and_upgrade/',
      'should fail when `stack` command is not installed.'
    );
  });

  pretendPlatform('freebsd');

  await spawnStack(['--help'], options).then(fail, err => {
    t.strictEqual(
      err.toString(),
      'Error: `stack` command is not found in your PATH. Make sure you have instaled Stack. ' +
      'https://docs.haskellstack.org/en/stable/install_and_upgrade/#freebsd',
      'should show the platform-specific URL if available.'
    );
  });

  pretendPlatform.restore();
});

test('spawnStack()', t => {
  t.plan(9);

  spawnStack(['--numeric-version']).then(({stdout}) => {
    t.strictEqual(
      stdout,
      '1.4.0',
      'should run `stack` subcomand.'
    );
  });

  spawnStack(['abcefgh', '--allow-different-user']).catch(err => {
    t.strictEqual(
      err.toString().split('\n')[0],
      'Error: Command failed: stack abcefgh --allow-different-user',
      'should fail when the subcommand is not found.'
    );
  });

  const pkgs = ['array-0.5.1.1', 'time-1.8'];
  const cp = Observable.from(spawnStack(['unpack', ...pkgs]));
  const cpErr = Observable.from(spawnStack(['setup', '7.10.999', '--allow-different-user']));

  setTimeout(() => {
    cp.filter(line => line.startsWith('Unpacked ')).reduce((arr, line) => [...arr, line], [])
    .subscribe({
      next(arr) {
        t.deepEqual(
          arr,
          pkgs.map(pkg => `Unpacked ${pkg} to ${resolve(pkg)}${sep}`),
          'should be converted into an Observable using `Observable.from`.'
        );
      },
      error: t.fail,
      async complete() {
        await rmfr(`{${pkgs.join(',')}}`, {glob: true});
      }
    });

    cpErr.filter(line => line.startsWith('No information')).subscribe({
      next(line) {
        t.strictEqual(
          line,
          'No information found for ghc-7.10.999.',
          'should send each line of stderr to the subscription.'
        );
      },
      error(err) {
        t.strictEqual(
          err.toString().split('\n')[0],
          'Error: Command failed: stack setup 7.10.999 --allow-different-user',
          'should send error to the subscription when the command failed.'
        );
      }
    });
  }, 1000);

  const subscription = Observable.from(spawnStack([
    '--no-allow-different-user',
    '--version'
  ])).subscribe({
    error: t.fail
  });

  const closedBeforeUnsubscribed = subscription.closed;
  subscription.unsubscribe();
  const closedAfterUnsubscribed = subscription.closed;

  t.deepEqual(
    [closedBeforeUnsubscribed, closedAfterUnsubscribed],
    [false, true],
    'should be cancelable via Subscription#unsubscribe().'
  );

  spawnStack(Buffer.from('1')).catch(({message}) => {
    t.strictEqual(
      message,
      'Expected arguments of `stack` command (Array<string>), but got a non-array value <Buffer 31>.',
      'should fail when the first parameter receives a non-array value.'
    );
  });

  spawnStack().catch(({message}) => {
    t.strictEqual(
      message,
      'Expected arguments of `stack` command (Array<string>), but got a non-array value undefined.',
      'should fail when it takes no arguments.'
    );
  });
});
