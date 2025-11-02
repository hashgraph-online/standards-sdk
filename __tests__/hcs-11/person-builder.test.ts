import { PersonBuilder } from '../../src/hcs-11/person-builder';

describe('PersonBuilder', () => {
  test('builds profile with defaults and warns on missing optional fields', () => {
    const b = new PersonBuilder().setName('Alice').setBio('hello world');
    const profile = b.build();
    expect(profile.display_name).toBe('Alice');
    expect(profile.type).toBe(0);
    expect(profile.version).toBe('1.0');
  });

  test('addSocial overrides existing platform handle', () => {
    const b = new PersonBuilder()
      .setName('Bob')
      .setBio('bio')
      .addSocial('twitter' as any, 'first')
      .addSocial('twitter' as any, 'second');
    const profile = b.build();
    const twitter = (profile.socials || []).find(
      s => s.platform === ('twitter' as any),
    );
    expect(twitter?.handle).toBe('second');
  });

  test('existing profile picture uses hcs://1/{id}', () => {
    const b = new PersonBuilder()
      .setName('C')
      .setBio('b')
      .setExistingProfilePicture('0.0.9');
    const profile = b.build();
    expect(profile.profileImage).toBe('hcs://1/0.0.9');
  });
});
